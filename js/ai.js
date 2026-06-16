// ===== 可见性（迷雾）、AI 文明、野蛮人 =====

// 迷雾：每个文明当前可见 & 历史已发现
var Visibility = (function () {
  'use strict';

  function addVisible(set, q, r, range) {
    for (var d = 0; d <= range; d++) {
      if (d === 0) { set.add(Util.axialKey(q, r)); continue; }
      var ring = Units.ringAt(q, r, d);
      for (var i = 0; i < ring.length; i++) set.add(ring[i]);
    }
  }

  function compute(civId) {
    var set = new Set();
    for (var i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (u.civ !== civId) continue;
      addVisible(set, u.q, u.r, Units.sightRange(u));
    }
    for (var c = 0; c < G.cities.length; c++) {
      var city = G.cities[c];
      if (!city || city.civ !== civId) continue;
      addVisible(set, city.q, city.r, 3);
    }
    return set;
  }

  function recomputeAll() {
    G.visible = {};
    G.revealed = G.revealed || {};
    for (var i = 0; i < G.civs.length; i++) {
      var id = G.civs[i].id;
      var v = compute(id);
      G.visible[id] = v;
      if (!G.revealed[id]) G.revealed[id] = new Set();
      v.forEach(function (k) { G.revealed[id].add(k); });
    }
    // 野蛮人可见性（全图感知附近目标）
    G.visible[-1] = compute(-1);
    if (!G.revealed[-1]) G.revealed[-1] = new Set();
  }

  function isVisible(civId, key) {
    return G.visible && G.visible[civId] && G.visible[civId].has(key);
  }
  function isRevealed(civId, key) {
    return G.revealed && G.revealed[civId] && G.revealed[civId].has(key);
  }

  return { compute: compute, recomputeAll: recomputeAll, isVisible: isVisible, isRevealed: isRevealed };
})();

// AI 文明
var AI = (function () {
  'use strict';

  function aiTurn(civ) {
    aiCityPhase(civ);
    aiUnitPhase(civ);
  }
  function aiCityPhase(civ) {
    for (var i = 0; i < G.cities.length; i++) {
      var city = G.cities[i];
      if (!city || city.civ !== civ.id) continue;
      aiCityProduce(city);
    }
  }
  function aiUnitPhase(civ) {
    var list = G.units.filter(function (u) { return u.civ === civ.id; });
    for (var j = 0; j < list.length; j++) aiUnitAct(list[j]);
  }

  function aiCityProduce(city) {
    if (city.buildQueue.length) return;
    var civ = G.civs[city.civ];
    var opts = Cities.buildOptions(city);
    if (!opts.length) return;
    var milCount = G.units.filter(function (u) { return u.civ === civ.id && Units.isMilitary(u); }).length;
    var threat = nearestEnemyTo(city.q, city.r, civ.id, 5);
    var cityCount = G.cities.filter(function (c) { return c && c.civ === civ.id; }).length;
    var canSettle = city.pop >= 2 && cityCount < 5;

    var choice = null;
    if (threat) {
      // 受威胁：造防御单位
      choice = pickCheapest(opts, 'unit', ['warrior', 'archer', 'spearman', 'swordsman', 'horseman', 'slinger']);
    }
    if (!choice && canSettle && milCount >= 2 && Math.random() < 0.35) {
      choice = findOpt(opts, { kind: 'unit', key: 'settler' });
    }
    if (!choice && milCount < 3) {
      choice = pickCheapest(opts, 'unit', ['warrior', 'archer', 'spearman', 'slinger']);
    }
    if (!choice) {
      // 经济建筑优先
      var econ = ['granary', 'library', 'market', 'monument', 'workshop', 'university', 'granary', 'library', 'barracks', 'harbor', 'walls', 'stable'];
      for (var e = 0; e < econ.length; e++) {
        choice = findOpt(opts, { kind: 'building', key: econ[e] });
        if (choice) break;
      }
    }
    if (!choice) {
      // 造兵
      choice = pickCheapest(opts, 'unit', ['warrior', 'archer', 'spearman', 'slinger', 'horseman', 'swordsman']);
    }
    if (!choice) choice = opts[0];
    if (choice) city.buildQueue.push(Util.clone(choice));
  }

  function findOpt(opts, filter) {
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].kind === filter.kind && opts[i].key === filter.key) return opts[i];
    }
    return null;
  }
  function pickCheapest(opts, kind, keys) {
    var cands = opts.filter(function (o) {
      return o.kind === kind && (!keys || keys.indexOf(o.key) >= 0);
    });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return a.cost - b.cost; });
    return cands[0];
  }

  function aiUnitAct(u) {
    u.moves = Units.def(u).moves;
    var d = Units.def(u);
    if (d.kind === 'settler') return aiSettler(u);
    if (d.kind === 'builder') return aiBuilder(u);
    return aiMilitary(u);
  }

  function aiSettler(u) {
    var civ = G.civs[u.civ];
    var spot = bestSettleSpot(u);
    if (!spot) { wander(u); return; }
    if (spot.q === u.q && spot.r === u.r) {
      Cities.foundCity(u);
      return;
    }
    moveTo(u, spot.q, spot.r);
    // 到达即建城（下个判断在下次行动；这里若已到达则建）
    if (u && u.q === spot.q && u.r === spot.r && u.hp > 0) {
      var tile = G.map.tiles[Util.axialKey(u.q, u.r)];
      if (tile && tile.cityId == null && !tile.water && tile.terrain !== 'mountain') Cities.foundCity(u);
    }
  }

  function aiBuilder(u) {
    var civ = G.civs[u.civ];
    // 找最近的可改良的己方地块
    var best = null, bestD = 99;
    for (var k in G.map.tiles) {
      var t = G.map.tiles[k];
      if (t.owner !== civ.id) continue;
      if (t.improvement) continue;
      if (t.cityId != null) continue;
      var imp = bestImprovementFor(t, civ);
      if (!imp) continue;
      var dd = Util.hexDistance({ q: u.q, r: u.r }, { q: t.q, r: t.r });
      if (dd < bestD) { bestD = dd; best = { t: t, imp: imp }; }
    }
    if (!best) { wander(u); return; }
    if (best.t.q === u.q && best.t.r === u.r) {
      best.t.improvement = best.imp;
      u.charges--;
      if (u.charges <= 0) Units.killUnit(u);
      return;
    }
    moveTo(u, best.t.q, best.t.r);
  }

  function bestImprovementFor(t, civ) {
    for (var ik in Data.IMPROVE) {
      var imp = Data.IMPROVE[ik];
      if (civ.techs[imp.tech] && imp.valid(t)) return ik;
    }
    return null;
  }

  function aiMilitary(u) {
    var civ = G.civs[u.civ];
    var d = Units.def(u);
    var isGarrison = G.cities.some(function (c) { return c && c.garrison === u.id; });
    // 1. 范围内可攻击的敌人
    var targets = Units.attackTargets(u);
    if (targets.length) {
      // 选最弱目标
      targets.sort(function (a, b) {
        var ua = Units.unitAt(a.q, a.r);
        var ub = Units.unitAt(b.q, b.r);
        var sa = ua ? ua.hp : 999; var sb = ub ? ub.hp : 999;
        return sa - sb;
      });
      var tg = targets[0];
      doAttack(u, tg);
      return;
    }
    // 驻军：留守防御（除非能攻击），保证城市有守卫
    if (isGarrison) { u.fortified = true; return; }
    // 2. 附近蛮族 -> 剿灭
    var barb = nearestEnemyTo(u.q, u.r, civ.id, 5, true);
    if (barb) { stepToward(u, barb.q, barb.r); return; }
    // 3. 推进敌方城市（具备兵力优势时）
    var milCount = G.units.filter(function (x) { return x.civ === civ.id && Units.isMilitary(x); }).length;
    var enemyCity = nearestEnemyCity(u.q, u.r, civ.id, 8);
    if (enemyCity && milCount >= 4) { stepToward(u, enemyCity.q, enemyCity.r); return; }
    // 4. 探索未发现地块
    var unexp = nearestUnexplored(u, civ.id);
    if (unexp && Math.random() < 0.7) { stepToward(u, unexp.q, unexp.r); return; }
    // 5. 回城驻防
    var ownCity = nearestOwnCity(u.q, u.r, civ.id);
    if (ownCity && Util.hexDistance({ q: u.q, r: u.r }, { q: ownCity.q, r: ownCity.r }) > 2) {
      stepToward(u, ownCity.q, ownCity.r);
    } else {
      u.fortified = true;
    }
  }

  function doAttack(u, tg) {
    var tile = G.map.tiles[Util.axialKey(tg.q, tg.r)];
    var targetUnit = Units.unitAt(tg.q, tg.r);
    var d = Units.def(u);
    var ranged = (d.kind === 'ranged' || d.kind === 'siege' || d.kind === 'naval_ranged');
    if (targetUnit) {
      if (ranged || Util.hexDistance({ q: u.q, r: u.r }, { q: tg.q, r: tg.r }) > 1) {
        Combat.rangedAttack(u, targetUnit);
      } else {
        Combat.meleeAttack(u, targetUnit);
      }
    } else if (tg.city && tile.cityId != null) {
      var city = G.cities[tile.cityId];
      if (ranged || Util.hexDistance({ q: u.q, r: u.r }, { q: tg.q, r: tg.r }) > 1) {
        Combat.attackCity(u, city);
      } else {
        Combat.attackCity(u, city);
      }
    }
  }

  // ---- 寻路与移动辅助 ----
  function moveTo(u, dq, dr) {
    if (u.moves <= 0) return;
    var path = Units.pathTo(u, dq, dr, 60);
    if (path && path.length) Units.walkPath(u, path);
  }
  function stepToward(u, dq, dr) {
    // 全速向目标推进（消耗本回合全部移动力）
    if (u.moves <= 0) return;
    var path = Units.pathTo(u, dq, dr, 60);
    if (path && path.length) Units.walkPath(u, path);
  }

  function wander(u) {
    if (u.moves <= 0) return;
    var nbs = Util.neighbors(u.q, u.r, G.map);
    var ok = nbs.filter(function (t) {
      if (!Units.canStand(u, t)) return false;
      var occ = Units.unitAt(t.q, t.r);
      return !occ;
    });
    if (ok.length) {
      var pick = ok[Math.floor(Math.random() * ok.length)];
      Units.walkPath(u, [Util.axialKey(pick.q, pick.r)]);
    }
  }

  function nearestEnemyTo(q, r, civId, maxDist, onlyBarb) {
    var best = null, bd = maxDist;
    for (var i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (u.civ === civId) continue;
      if (onlyBarb && u.civ !== -1) continue;
      var dd = Util.hexDistance({ q: q, r: r }, { q: u.q, r: u.r });
      if (dd < bd) { bd = dd; best = { q: u.q, r: u.r }; }
    }
    return best;
  }
  function nearestEnemyCity(q, r, civId, maxDist) {
    var best = null, bd = maxDist;
    for (var i = 0; i < G.cities.length; i++) {
      var c = G.cities[i];
      if (!c || c.civ === civId) continue;
      var dd = Util.hexDistance({ q: q, r: r }, { q: c.q, r: c.r });
      if (dd < bd) { bd = dd; best = { q: c.q, r: c.r }; }
    }
    return best;
  }
  function nearestOwnCity(q, r, civId) {
    var best = null, bd = 99;
    for (var i = 0; i < G.cities.length; i++) {
      var c = G.cities[i];
      if (!c || c.civ !== civId) continue;
      var dd = Util.hexDistance({ q: q, r: r }, { q: c.q, r: c.r });
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  }
  function nearestUnexplored(u, civId) {
    // 在视野范围内找未发现地块
    var best = null, bd = 99;
    var ring = Units.ringAt(u.q, u.r, 3).concat(Units.ringAt(u.q, u.r, 4));
    for (var i = 0; i < ring.length; i++) {
      var k = ring[i];
      if (!G.map.tiles[k]) continue;
      if (Visibility.isVisible(civId, k)) continue;
      var t = G.map.tiles[k];
      var dd = Util.hexDistance({ q: u.q, r: u.r }, { q: t.q, r: t.r });
      if (dd < bd) { bd = dd; best = { q: t.q, r: t.r }; }
    }
    return best;
  }

  // AI 拓荒选址
  function bestSettleSpot(settler) {
    var civ = G.civs[settler.civ];
    var best = null, bestScore = -1;
    var startK = Util.axialKey(settler.q, settler.r);
    for (var d = 0; d <= 4; d++) {
      var ring = (d === 0) ? [startK] : Units.ringAt(settler.q, settler.r, d);
      for (var i = 0; i < ring.length; i++) {
        var t = G.map.tiles[ring[i]];
        if (!t || t.water || t.terrain === 'mountain') continue;
        if (t.cityId != null) continue;
        if (t.owner != null && t.owner !== civ.id) continue;
        // 距已有城市 >= 3
        var tooClose = false;
        for (var c = 0; c < G.cities.length; c++) {
          if (!G.cities[c]) continue;
          if (Util.hexDistance({ q: t.q, r: t.r }, { q: G.cities[c].q, r: G.cities[c].r }) < 3) { tooClose = true; break; }
        }
        if (tooClose) continue;
        var score = scoreSettle(t);
        if (score > bestScore) { bestScore = score; best = { q: t.q, r: t.r }; }
      }
    }
    return best;
  }

  function scoreSettle(t) {
    var s = 0;
    var civ = { techs: { mining: true, animal_husbandry: true, astrology: true, pottery: true } };
    var ring = Units.ringAt(t.q, t.r, 1).concat(Units.ringAt(t.q, t.r, 2));
    for (var i = 0; i < ring.length; i++) {
      var nt = G.map.tiles[ring[i]];
      if (!nt || nt.water) continue;
      var y = MapGen.tileYields(nt, civ);
      s += y[0] * 2 + y[1] * 2 + y[2];
    }
    if (MapGen.isFreshWater(t, G.map)) s += 6;
    if (MapGen.isCoastal(t, G.map)) s += 4;
    return s;
  }

  return { aiTurn: aiTurn, aiCityPhase: aiCityPhase, aiUnitPhase: aiUnitPhase,
           bestSettleSpot: bestSettleSpot, scoreSettle: scoreSettle,
           nearestEnemyTo: nearestEnemyTo, wander: wander, stepToward: stepToward };
})();

// 野蛮人
var Barbarians = (function () {
  'use strict';

  function init(map, rng, startTile) {
    G.camps = [];
    var count = Math.floor(map.cols * map.rows / 170);
    var tries = 0;
    while (G.camps.length < count && tries < count * 30) {
      tries++;
      var k = map.allKeys[Math.floor(rng() * map.allKeys.length)];
      var t = map.tiles[k];
      if (!t || t.water || t.terrain === 'mountain') continue;
      if (t.cityId != null) continue;
      if (Util.hexDistance({ q: t.q, r: t.r }, { q: startTile.q, r: startTile.r }) < 6) continue;
      // 营地之间相距 >= 4
      var close = false;
      for (var i = 0; i < G.camps.length; i++) {
        if (Util.hexDistance({ q: t.q, r: t.r }, { q: G.camps[i].q, r: G.camps[i].r }) < 4) { close = true; break; }
      }
      if (close) continue;
      t.barbarianCamp = true;
      G.camps.push({ q: t.q, r: t.r, lastSpawn: 0 });
    }
  }

  function turn() {
    // 全局蛮族上限，避免失控
    var totalBarbs = G.units.filter(function (u) { return u.civ === -1; }).length;
    var cap = G.camps.length * 2;
    // 营地产兵
    for (var i = 0; i < G.camps.length; i++) {
      var camp = G.camps[i];
      var tile = G.map.tiles[Util.axialKey(camp.q, camp.r)];
      if (!tile || !tile.barbarianCamp) continue;
      if (G.turn - camp.lastSpawn >= Math.max(7, Math.round(13 / G.difficulty.barbRate))) {
        // 附近是否有非蛮族单位/城市（激活）
        var target = AI.nearestEnemyTo(camp.q, camp.r, -1, 6);
        var barbsNear = countBarbsNear(camp.q, camp.r, 2);
        if (totalBarbs < cap && (target || barbsNear < 2) && !Units.unitAt(camp.q, camp.r)) {
          spawnBarb(camp.q, camp.r);
          camp.lastSpawn = G.turn;
          totalBarbs++;
        }
      }
    }
    // 蛮族单位行动
    var barbs = G.units.filter(function (u) { return u.civ === -1; });
    for (var b = 0; b < barbs.length; b++) barbAct(barbs[b]);
  }

  function countBarbsNear(q, r, dist) {
    var n = 0;
    for (var i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (u.civ !== -1) continue;
      if (Util.hexDistance({ q: q, r: r }, { q: u.q, r: u.r }) <= dist) n++;
    }
    return n;
  }

  function spawnBarb(q, r) {
    Units.makeUnit('barb_warrior', -1, q, r);
  }

  function barbAct(u) {
    u.moves = Units.def(u).moves;
    // 可攻击
    var targets = Units.attackTargets(u);
    if (targets.length) {
      var tg = targets[0];
      var tu = Units.unitAt(tg.q, tg.r);
      if (tu) Combat.meleeAttack(u, tu);
      else if (tg.city) { var c = G.cities[G.map.tiles[Util.axialKey(tg.q, tg.r)].cityId]; if (c) Combat.attackCity(u, c); }
      return;
    }
    var target = AI.nearestEnemyTo(u.q, u.r, -1, 8);
    if (target) { AI.stepToward(u, target.q, target.r); return; }
    AI.wander(u);
  }

  return { init: init, turn: turn, spawnBarb: spawnBarb };
})();
