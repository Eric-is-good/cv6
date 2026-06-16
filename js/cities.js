// ===== 城市系统：建城、产出、增长、建造、边境扩张、攻防 =====
var Cities = (function () {
  'use strict';

  var NAME_POOL = ['长安', '洛阳', '开封', '金陵', '临安', '苏州', '杭州', '成都',
    '广州', '泉州', '扬州', '襄阳', '江陵', '长沙', '敦煌', '咸阳', '邺城', '武昌',
    '辽阳', '会稽', '豫章', '桂林', '姑苏', '燕京', '凉州'];

  function makeCity(civ, q, r, name, capital) {
    var id = G.nextCityId++;
    var city = {
      id: id, name: name, civ: civ, q: q, r: r, capital: !!capital,
      pop: 1, food: 0, prod: 0, buildQueue: [],
      buildings: {}, culture: 0, tilesClaimed: 0, border: 1,
      hp: 100, maxHp: 100, garrison: null, rangedUsed: false,
      owned: {}
    };
    G.cities.push(city);
    var tile = G.map.tiles[Util.axialKey(q, r)];
    tile.cityId = id;
    tile.owner = civ;
    city.owned[Util.axialKey(q, r)] = true;
    // 初始圈占半径1
    claimRing(city, 1);
    // 初始建筑：首都宫殿，否则纪念碑
    if (capital) city.buildings.palace = true;
    return city;
  }

  function claimRing(city, dist) {
    var ring = Units.ringAt(city.q, city.r, dist);
    for (var i = 0; i < ring.length; i++) {
      var t = G.map.tiles[ring[i]];
      if (!t) continue;
      if (t.water) {
        // 海洋也能拥有（便于渔业），但优先陆地
      }
      if (t.owner != null && t.owner !== city.civ) continue;
      if (t.cityId != null && t.cityId !== city.id) continue;
      t.owner = city.civ;
      city.owned[ring[i]] = true;
      city.tilesClaimed++;
    }
  }

  // 文化扩张：占据最近一块未拥有的格子
  function cultureExpand(city) {
    var cost = 15 + city.tilesClaimed * 8;
    if (city.culture < cost) return;
    // 找半径3内最近且可占的格子
    var best = null, bestD = 99;
    for (var d = 1; d <= 3; d++) {
      var ring = Units.ringAt(city.q, city.r, d);
      for (var i = 0; i < ring.length; i++) {
        var k = ring[i];
        var t = G.map.tiles[k];
        if (!t) continue;
        if (t.owner === city.civ && city.owned[k]) continue;
        if (t.owner != null && t.owner !== city.civ) continue;
        if (t.cityId != null && t.cityId !== city.id) continue;
        if (Util.hexDistance({ q: city.q, r: city.r }, { q: t.q, r: t.r }) < bestD) {
          bestD = Util.hexDistance({ q: city.q, r: city.r }, { q: t.q, r: t.r });
          best = t;
        }
      }
    }
    if (best) {
      city.culture -= cost;
      best.owner = city.civ;
      city.owned[Util.axialKey(best.q, best.r)] = true;
      city.tilesClaimed++;
    } else {
      city.culture = cost; // 满了不再累积
    }
  }

  // 计算城市可工作的格子与总产出
  function computeYields(city) {
    var civ = G.civs[city.civ];
    // 城市中心产出（至少 2 食 1 产 1 金）
    var center = G.map.tiles[Util.axialKey(city.q, city.r)];
    var cy = MapGen.tileYields(center, civ).slice();
    cy[0] = Math.max(cy[0], 2); cy[1] = Math.max(cy[1], 1); cy[2] = Math.max(cy[2], 1);
    if (city.capital) { cy[2] += 1; }

    // 候选可工作地块（拥有的陆地非中心格子）
    var ownedKeys = Object.keys(city.owned).filter(function (k) {
      return k !== Util.axialKey(city.q, city.r);
    });
    var scored = ownedKeys.map(function (k) {
      var t = G.map.tiles[k];
      var y = MapGen.tileYields(t, civ);
      var score = y[0] * 2 + y[1] * 2 + y[2] + y[3] + y[4];
      return { k: k, y: y, score: score, t: t };
    }).filter(function (o) { return o.t && !o.t.water; })
      .sort(function (a, b) { return b.score - a.score; });

    // 工作数量 = 人口
    var slots = city.pop;
    var worked = scored.slice(0, slots);
    city.worked = worked.map(function (o) { return o.k; });

    var total = cy.slice();
    for (var i = 0; i < worked.length; i++) {
      for (var j = 0; j < 5; j++) total[j] += worked[i].y[j];
    }
    // 建筑产出
    for (var bk in city.buildings) {
      var bd = Data.BUILDING[bk];
      if (!bd) continue;
      for (var m = 0; m < 5; m++) total[m] += bd.yield[m];
    }
    city.yields = total;
    return total;
  }

  function growthNeed(pop) { return 18 + (pop - 1) * 8 + pop * pop; }

  function housing(city) {
    var h = 2;
    if (city.capital) h += 1;
    for (var bk in city.buildings) {
      var bd = Data.BUILDING[bk];
      if (bd && bd.housing) h += bd.housing;
    }
    var t = G.map.tiles[Util.axialKey(city.q, city.r)];
    if (MapGen.isFreshWater(t, G.map)) h += 2;
    return h;
  }

  // 每回合城市更新
  function update(city) {
    var civ = G.civs[city.civ];
    if (!civ) return;
    computeYields(city);
    var y = city.yields;

    // 食物/人口
    var consume = 2 * city.pop;
    var netFood = y[0] - consume;
    var house = housing(city);
    if (netFood > 0 && city.pop >= house) netFood *= 0.35;
    city.food += netFood;
    var need = growthNeed(city.pop);
    if (city.food >= need) {
      city.food -= need;
      city.pop++;
      if (city.civ === 0) UI.notify(city.name + ' 人口增长至 ' + city.pop + '！', 'good');
    } else if (city.food < 0 && city.pop > 1) {
      city.food = 0;
      city.pop = Math.max(1, city.pop - 1);
    }

    // 产能
    city.prod += y[1];
    processQueue(city);

    // 文化 -> 扩张
    city.culture += y[4];
    cultureExpand(city);

    // 科技/金币归入文明
    civ.sciencePool += y[3];
    civ.gold += y[2];
    civ.culturePool += y[4];

    city.rangedUsed = false;
    // 城市回血
    if (city.hp < city.maxHp) city.hp = Math.min(city.maxHp, city.hp + 5);
  }

  function processQueue(city) {
    if (!city.buildQueue.length) return;
    var item = city.buildQueue[0];
    var cost = itemCost(item);
    if (city.prod >= cost) {
      city.prod -= cost;
      city.buildQueue.shift();
      completeItem(city, item);
    }
  }

  function itemCost(item) {
    if (item.kind === 'unit') return Data.UNIT[item.key].cost;
    return Data.BUILDING[item.key].cost;
  }

  function completeItem(city, item) {
    var civ = G.civs[city.civ];
    if (item.kind === 'unit') {
      var ud = Data.UNIT[item.key];
      var spot = findSpawn(city);
      if (spot) {
        var u = Units.makeUnit(item.key, city.civ, spot.q, spot.r);
        if (city.civ === 0) UI.notify(city.name + ' 建造了 ' + ud.name + '。', 'good');
        // 城市驻军：若为军事且无驻军，则驻防
        if (Units.isMilitary({ type: item.key }) && city.garrison == null && spot.q === city.q && spot.r === city.r) {
          city.garrison = u.id;
        }
      } else {
        // 没地方放，退回一半产能
        city.prod += Math.floor(ud.cost / 2);
      }
    } else {
      var bd = Data.BUILDING[item.key];
      city.buildings[item.key] = true;
      if (item.key === 'walls') { city.maxHp = 200; city.hp += 100; }
      if (city.civ === 0) UI.notify(city.name + ' 建成了 ' + bd.name + '。', 'good');
    }
  }

  function findSpawn(city) {
    var baseK = Util.axialKey(city.q, city.r);
    if (!Units.unitAt(city.q, city.r)) return { q: city.q, r: city.r };
    var nbs = Util.neighbors(city.q, city.r, G.map);
    for (var i = 0; i < nbs.length; i++) {
      var t = nbs[i];
      if (!Units.unitAt(t.q, t.r) && !t.water && t.terrain !== 'mountain') return { q: t.q, r: t.r };
    }
    return null;
  }

  // 可建造项（受科技/资源/已建限制）
  function buildOptions(city) {
    var civ = G.civs[city.civ];
    var opts = [];
    // 单位
    for (var uk in Data.UNIT) {
      var ud = Data.UNIT[uk];
      if (ud.tech && !civ.techs[ud.tech]) continue;
      if (ud.res && !civHasResource(civ, ud.res)) continue;
      if (Units.isNaval({ type: uk }) && !MapGen.isCoastal(G.map.tiles[Util.axialKey(city.q, city.r)], G.map)) continue;
      opts.push({ kind: 'unit', key: uk, name: ud.name, cost: ud.cost, glyph: ud.glyph });
    }
    // 建筑
    for (var bk in Data.BUILDING) {
      var bd = Data.BUILDING[bk];
      if (bd.unique && city.buildings[bk]) continue;
      if (city.buildings[bk]) continue;
      if (bd.tech && !civ.techs[bd.tech]) continue;
      // 同名城每城一座的奇观/宫殿跳过（palace 只首都）
      if (bk === 'palace' && !city.capital) continue;
      opts.push({ kind: 'building', key: bk, name: bd.name, cost: bd.cost });
    }
    return opts;
  }

  function civHasResource(civ, res) {
    // 拥有该战略资源（已揭示且境内有改良或资源）
    if (!civ.resourceCount) civ.resourceCount = {};
    return (civ.resourceCount[res] || 0) > 0;
  }

  // 重新统计文明境内资源（每回合调用）
  function recountResources(civ) {
    var counts = {};
    for (var k in G.map.tiles) {
      var t = G.map.tiles[k];
      if (t.owner !== civ.id) continue;
      if (!t.resource) continue;
      var res = Data.RESOURCE[t.resource];
      if (res.type !== 'strategic') continue;
      if (res.reveal && !civ.techs[res.reveal]) continue;
      counts[t.resource] = (counts[t.resource] || 0) + 1;
    }
    civ.resourceCount = counts;
  }

  function cityStr(city) {
    var g = city.garrison != null ? G.units.find(function (u) { return u.id === city.garrison; }) : null;
    var base = g ? Units.combatStr(g, true) : 8;
    if (city.buildings.walls) base += Data.BUILDING.walls.defStr;
    return base;
  }

  function cityRangedStr(city) {
    if (!city.buildings.walls) return 0;
    var g = city.garrison != null ? G.units.find(function (u) { return u.id === city.garrison; }) : null;
    var base = g ? Math.round(Units.combatStr(g, false) * 0.7) : 15;
    return base;
  }

  function captureCity(city, newCiv) {
    var oldCiv = city.civ;
    city.civ = newCiv;
    city.hp = Math.floor(city.maxHp / 2);
    city.buildQueue = [];
    // 城内敌方单位被消灭/俘获
    for (var i = G.units.length - 1; i >= 0; i--) {
      var u = G.units[i];
      if (u.q === city.q && u.r === city.r && u.civ === oldCiv) Units.killUnit(u);
    }
    city.garrison = null;
    // 该城市拥有的地块易主
    for (var k in city.owned) {
      var t = G.map.tiles[k];
      if (t) t.owner = newCiv;
    }
    var msg = '🏰 ' + G.civs[newCiv].name + ' 攻占了 ' + G.civs[oldCiv].name + ' 的城市 ' + city.name + '！';
    G.log.push({ t: G.turn, msg: msg });
    if (newCiv === 0 || oldCiv === 0) UI.notify(msg, newCiv === 0 ? 'good' : 'warn');
    // 检查文明是否灭亡（无城且无单位）
    if (G.civs[oldCiv]) {
      var stillHas = G.cities.some(function (c) { return c && c.civ === oldCiv; }) ||
        G.units.some(function (u) { return u.civ === oldCiv; });
      if (!stillHas) {
        var dm = '☠ ' + G.civs[oldCiv].name + ' 文明已灭亡！';
        G.log.push({ t: G.turn, msg: dm });
        if (oldCiv !== 0) UI.notify(dm, 'good');
      }
    }
  }

  function foundCity(settler) {
    var civ = G.civs[settler.civ];
    var used = NAME_POOL.filter(function (n) {
      return G.cities.some(function (c) { return c && c.name === n && c.civ === settler.civ; });
    });
    var name = used.length < NAME_POOL.length ? pickName(used) : (civ.name + (G.cities.length + 1));
    var capital = !G.cities.some(function (c) { return c && c.civ === settler.civ && c.capital; });
    var city = makeCity(settler.civ, settler.q, settler.r, name, capital);
    Units.killUnit(settler);
    if (settler.civ === 0) UI.notify('🏛 建立城市 ' + name + '！', 'good');
    G.log.push({ t: G.turn, msg: G.civs[settler.civ].name + ' 建立了城市 ' + name + '。' });
    return city;
  }

  function pickName(used) {
    for (var i = 0; i < NAME_POOL.length; i++) {
      if (used.indexOf(NAME_POOL[i]) < 0) return NAME_POOL[i];
    }
    return '新城';
  }

  function buyItem(city, item) {
    var civ = G.civs[city.civ];
    var goldCost = itemCost(item) * 4 + 20;
    if (civ.gold < goldCost) {
      if (city.civ === 0) UI.notify('金币不足！需要 ' + goldCost + ' 金。', 'warn');
      return false;
    }
    civ.gold -= goldCost;
    completeItem(city, item);
    return true;
  }

  return {
    makeCity: makeCity, computeYields: computeYields, update: update,
    buildOptions: buildOptions, cityStr: cityStr, cityRangedStr: cityRangedStr,
    captureCity: captureCity, foundCity: foundCity, buyItem: buyItem,
    itemCost: itemCost, recountResources: recountResources, housing: housing,
    growthNeed: growthNeed
  };
})();
