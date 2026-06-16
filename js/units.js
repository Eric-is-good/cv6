// ===== 单位系统：移动、路径、战斗、动作 =====
var Units = (function () {
  'use strict';

  var NAVAL = { naval: 1, naval_ranged: 1 };
  var CIVILIAN = { settler: 1, builder: 1 };

  function def(u) { return Data.UNIT[u.type]; }

  function isNaval(u) { return !!NAVAL[def(u).kind]; }
  function isCivilian(u) { return !!CIVILIAN[def(u).kind]; }
  function isMilitary(u) { return !CIVILIAN[def(u).kind] && !NAVAL[def(u).kind]; }

  // 地块对某单位的通行性
  function canStand(u, tile) {
    if (isNaval(u)) return tile.water;
    return !tile.water && tile.terrain !== 'mountain';
  }

  // 移动消耗
  function moveCost(u, tile) {
    if (isNaval(u)) return 1;
    var cost = tile.hills ? 2 : 1;
    if (tile.feature) {
      var f = Data.FEATURE[tile.feature];
      if (f) cost = tile.hills ? (Math.max(2, f.moveCost) + 1) : f.moveCost;
    }
    return cost;
  }

  // 该格上是否有任何单位
  function unitAt(q, r) {
    for (var i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (u.q === q && u.r === r) return u;
    }
    return null;
  }

  // 视野范围
  function sightRange(u) {
    if (def(u).kind === 'scout') return 3;
    return 2;
  }

  // Dijkstra：从单位位置出发，返回 {key: 累计消耗}
  function reachable(u) {
    var result = {};
    var startK = Util.axialKey(u.q, u.r);
    result[startK] = 0;
    // 优先队列（简单数组）
    var open = [{ q: u.q, r: u.r, c: 0 }];
    var maxMoves = u.moves;
    while (open.length) {
      open.sort(function (a, b) { return a.c - b.c; });
      var cur = open.shift();
      var curK = Util.axialKey(cur.q, cur.r);
      if (cur.c > result[curK]) continue;
      if (cur.c >= maxMoves) continue;
      var nbs = Util.neighbors(cur.q, cur.r, G.map);
      for (var i = 0; i < nbs.length; i++) {
        var n = nbs[i];
        if (!canStand(u, n)) continue;
        // 不能穿过敌方单位；友方占据的格子也不能进入（一单位一格）
        var occ = unitAt(n.q, n.r);
        if (occ && occ.civ !== u.civ) continue; // 敌方挡路
        if (occ && occ.civ === u.civ && (Util.axialKey(n.q, n.r) !== startK)) {
          // 友方单位占据，不能停留
          continue;
        }
        var cost = moveCost(u, n);
        var nc = cur.c + cost;
        var nk = Util.axialKey(n.q, n.r);
        if (result[nk] !== undefined && result[nk] <= nc) continue;
        if (nc > maxMoves) continue;
        result[nk] = nc;
        open.push({ q: n.q, r: n.r, c: nc });
      }
    }
    delete result[startK];
    return result;
  }

  // A* 寻路（用于多回合行军 / 长距离），返回 keys 数组（不含起点）
  function pathTo(u, dq, dr, maxSteps) {
    var startK = Util.axialKey(u.q, u.r);
    var goalK = Util.axialKey(dq, dr);
    if (startK === goalK) return [];
    var open = [{ q: u.q, r: u.r, g: 0, f: 0, parent: null, key: startK }];
    var best = {}; best[startK] = 0;
    var steps = 0;
    while (open.length && steps < 4000) {
      steps++;
      open.sort(function (a, b) { return a.f - b.f; });
      var cur = open.shift();
      var curK = cur.key;
      if (curK === goalK) {
        var path = [];
        var node = cur;
        while (node.parent) { path.unshift(Util.axialKey(node.q, node.r)); node = node.parent; }
        return path;
      }
      var nbs = Util.neighbors(cur.q, cur.r, G.map);
      for (var i = 0; i < nbs.length; i++) {
        var n = nbs[i];
        if (!canStand(u, n)) continue;
        var occ = unitAt(n.q, n.r);
        var nk = Util.axialKey(n.q, n.r);
        if (occ && occ.civ !== u.civ && nk !== goalK) continue;
        var cost = moveCost(u, n);
        var g = cur.g + cost;
        if (best[nk] !== undefined && best[nk] <= g) continue;
        best[nk] = g;
        var h = Util.hexDistance({ q: n.q, r: n.r }, { q: dq, r: dr });
        open.push({ q: n.q, r: n.r, g: g, f: g + h, parent: cur, key: nk });
      }
    }
    return null;
  }

  // 沿路径走（消耗本回合移动力，返回剩余路径）
  function walkPath(u, path) {
    while (path.length && u.moves > 0 && u.hp > 0) {
      var step = path[0];
      var tile = G.map.tiles[step];
      if (!tile) { path = []; break; }
      var occ = unitAt(tile.q, tile.r);
      if (occ && occ.civ !== u.civ) {
        // 撞到敌人 -> 攻击并停止
        if (isMilitary(u)) Combat.meleeAttack(u, occ);
        break;
      }
      if (occ && occ.civ === u.civ) break; // 友方阻挡
      var cost = moveCost(u, tile);
      u.q = tile.q; u.r = tile.r;
      enterTile(u);
      if (u.moves >= cost) u.moves -= cost; else u.moves = 0;
      path.shift();
    }
    return path; // 剩余路径
  }

  function leaveTile(u) {}
  function enterTile(u) {
    // 进入后自动拾取/占领野蛮人营地
    var tile = G.map.tiles[Util.axialKey(u.q, u.r)];
    if (tile && tile.barbarianCamp && u.civ === 0) {
      tile.barbarianCamp = false;
      G.civs[0].gold += 40;
      UI.notify('扫荡了一个蛮族营地，获得 40 金币！', 'good');
    }
  }

  // 计算战斗强度（含地形防御/驻防）
  function combatStr(u, asDefender) {
    var d = def(u);
    var base = asDefender && d.def ? d.def : d.str;
    if (!base) return 0;
    var tile = G.map.tiles[Util.axialKey(u.q, u.r)];
    var mod = 0;
    if (asDefender) {
      if (tile && tile.hills) mod += 3;
      if (tile && tile.feature && Data.FEATURE[tile.feature]) mod += Data.FEATURE[tile.feature].defense;
      if (tile && tile.river) mod += 2;
      if (u.fortified) mod += 6;
      // 驻防城市
      if (tile && tile.cityId != null) mod += 6;
    }
    if (d.bonusVsCav) base += 0;
    // 受伤降低强度
    var hpFactor = 1 - (1 - u.hp / 100) * 0.5;
    return Math.round((base + mod) * hpFactor);
  }

  // 获取单位可攻击的目标格子
  function attackTargets(u) {
    var d = def(u);
    var targets = [];
    if (d.kind !== 'ranged' && d.kind !== 'siege' && d.kind !== 'naval_ranged') {
      // 近战：相邻敌方
      var nbs = Util.neighbors(u.q, u.r, G.map);
      for (var i = 0; i < nbs.length; i++) {
        var occ = unitAt(nbs[i].q, nbs[i].r);
        if (occ && occ.civ !== u.civ) targets.push({ q: nbs[i].q, r: nbs[i].r });
        if (nbs[i].cityId != null) {
          var c = G.cities[nbs[i].cityId];
          if (c && c.civ !== u.civ) targets.push({ q: nbs[i].q, r: nbs[i].r, city: true });
        }
      }
    } else {
      // 远程：范围内敌方（需可见）
      var range = d.range || 1;
      for (var dist = 1; dist <= range; dist++) {
        var ring = ringAt(u.q, u.r, dist);
        for (var j = 0; j < ring.length; j++) {
          var k = ring[j];
          var t = G.map.tiles[k];
          if (!t) continue;
          if (!Visibility.isVisible(u.civ, k)) continue;
          var o2 = unitAt(t.q, t.r);
          if (o2 && o2.civ !== u.civ) targets.push({ q: t.q, r: t.r });
          if (t.cityId != null) {
            var c2 = G.cities[t.cityId];
            if (c2 && c2.civ !== u.civ) targets.push({ q: t.q, r: t.r, city: true });
          }
        }
      }
    }
    return targets;
  }

  function ringAt(q, r, dist) {
    // 六边形环
    var dir = Util.HEX_DIRS[4]; // 从某方向开始
    var cq = q + dir.q * dist, cr = r + dir.r * dist;
    var keys = [];
    for (var i = 0; i < 6; i++) {
      for (var j = 0; j < dist; j++) {
        keys.push(Util.axialKey(cq, cr));
        var d = Util.HEX_DIRS[i];
        cq += d.q; cr += d.r;
      }
    }
    return keys;
  }

  function refreshMoves(civId) {
    for (var i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (u.civ === civId && u.hp > 0) {
        u.moves = def(u).moves;
        // 治疗驻防单位
        if (u.fortified || u.healing) {
          u.hp = Math.min(100, u.hp + 10);
        }
        // 玩家的行军队列自动继续
        if (civId === 0 && u.waitPath && u.waitPath.length) {
          var remain = walkPath(u, u.waitPath);
          u.waitPath = remain.length ? remain : null;
        }
      }
    }
  }

  function killUnit(u) {
    var idx = G.units.indexOf(u);
    if (idx >= 0) G.units.splice(idx, 1);
    // 若是城市驻军，清理
    for (var i = 0; i < G.cities.length; i++) {
      if (G.cities[i] && G.cities[i].garrison === u.id) G.cities[i].garrison = null;
    }
  }

  function makeUnit(type, civ, q, r) {
    var d = Data.UNIT[type];
    var u = {
      id: G.nextUnitId++,
      type: type, civ: civ, q: q, r: r,
      hp: 100, moves: d.moves, movesMax: d.moves,
      fortified: false, healing: false, charges: d.charges || 0,
      waitPath: null
    };
    G.units.push(u);
    return u;
  }

  function cityNameAt(q, r) {
    var t = G.map.tiles[Util.axialKey(q, r)];
    return t && t.cityId != null && G.cities[t.cityId] ? G.cities[t.cityId].name : null;
  }

  return {
    def: def, isNaval: isNaval, isCivilian: isCivilian, isMilitary: isMilitary,
    canStand: canStand, moveCost: moveCost, unitAt: unitAt, sightRange: sightRange,
    reachable: reachable, pathTo: pathTo, walkPath: walkPath,
    combatStr: combatStr, attackTargets: attackTargets, ringAt: ringAt,
    refreshMoves: refreshMoves, killUnit: killUnit, makeUnit: makeUnit,
    enterTile: enterTile
  };
})();

// 战斗结算（依赖 Units）
var Combat = (function () {
  'use strict';

  function damage(attStr, defStr, bonus) {
    var diff = attStr - defStr - (bonus || 0);
    var base = 30 * Math.exp(diff / 25);
    var f = 0.85 + Math.random() * 0.3;
    return Math.max(1, Math.min(100, Math.round(base * f)));
  }

  function meleeAttack(attacker, defender) {
    var aDef = Data.UNIT[attacker.type];
    var as = Units.combatStr(attacker, false);
    var ds = Units.combatStr(defender, true);
    var bonusToAtt = 0;
    if (defender) {
      var dd = Data.UNIT[defender.type];
      if (aDef.bonusVsCav && dd.kind === 'cav') bonusToAtt = aDef.bonusVsCav;
    }
    var dmgDef = damage(as, ds, -bonusToAtt);
    var dmgAtt = damage(ds, as);
    defender.hp -= dmgDef;
    attacker.hp -= dmgAtt;
    attacker.moves = 0;
    attacker.fortified = false;
    G.log.push({ t: G.turn, msg: report(attacker, defender, dmgDef, dmgAtt) });

    var defenderDied = defender.hp <= 0;
    var attackerDied = attacker.hp <= 0;
    if (defenderDied) {
      Units.killUnit(defender);
      // 近战胜利则推进占位
      if (!attackerDied) {
        var atTile = G.map.tiles[Util.axialKey(attacker.q, attacker.r)];
        var dt = G.map.tiles[Util.axialKey(defender.q, defender.r)];
        // 如果该格上有城市且属于敌方，攻占需城市 hp 归零，这里仅处理单位
        if (dt && (dt.cityId == null)) {
          attacker.q = defender.q; attacker.r = defender.r;
          Units.enterTile(attacker);
        }
      }
    }
    if (attackerDied) Units.killUnit(attacker);
    return defenderDied;
  }

  function rangedAttack(attacker, targetUnit) {
    var as = Units.combatStr(attacker, false);
    var ds = Units.combatStr(targetUnit, true);
    var dmg = damage(as, ds);
    targetUnit.hp -= dmg;
    attacker.moves = 0;
    attacker.fortified = false;
    G.log.push({ t: G.turn, msg: rangedReport(attacker, targetUnit, dmg) });
    if (targetUnit.hp <= 0) Units.killUnit(targetUnit);
  }

  function attackCity(attacker, city) {
    var aDef = Data.UNIT[attacker.type];
    var isRanged = (aDef.kind === 'ranged' || aDef.kind === 'siege' || aDef.kind === 'naval_ranged');
    var as = Units.combatStr(attacker, false);
    var cs = Cities.cityStr(city);
    var bonus = aDef.bonusVsCity ? 10 : 0;
    var dmg = damage(as, cs, -bonus);
    city.hp -= dmg;
    // 近战攻城会受到城市反击
    var dmgAtt = 0;
    if (!isRanged) {
      dmgAtt = damage(cs, as);
      attacker.hp -= dmgAtt;
    }
    attacker.moves = 0;
    attacker.fortified = false;
    var attackerDead = attacker.hp <= 0;
    G.log.push({ t: G.turn, msg: '⚔ ' + civName(attacker.civ) + '的' + aDef.name +
      '攻击' + civName(city.civ) + '的城市' + city.name + '，造成 ' + dmg + ' 点伤害' +
      (dmgAtt ? '，受反击 ' + dmgAtt : '') + '。' });
    if (attackerDead) Units.killUnit(attacker);
    if (city.hp <= 0 && !attackerDead) {
      if (!isRanged) {
        // 近战可占领
        Cities.captureCity(city, attacker.civ);
      } else {
        city.hp = 1; // 远程不能占领
      }
    }
  }

  function civName(id) { return G.civs[id] ? G.civs[id].name : '?'; }

  function report(att, def, dd, da) {
    return '⚔ ' + civName(att.civ) + '的' + Data.UNIT[att.type].name +
      ' 与 ' + civName(def.civ) + '的' + Data.UNIT[def.type].name +
      ' 交战：造成 ' + dd + '，受到 ' + da + '。';
  }
  function rangedReport(att, def, dd) {
    return '🏹 ' + civName(att.civ) + '的' + Data.UNIT[att.type].name +
      ' 远程攻击 ' + civName(def.civ) + '的' + Data.UNIT[def.type].name + '，造成 ' + dd + '。';
  }

  return { damage: damage, meleeAttack: meleeAttack, rangedAttack: rangedAttack, attackCity: attackCity };
})();
