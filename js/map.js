// ===== 地图：六边形地形生成、河流、资源、可见性 =====
var MapGen = (function () {
  'use strict';

  var SIZE_PRESETS = {
    small: { cols: 24, rows: 16 },
    medium: { cols: 32, rows: 20 },
    large: { cols: 40, rows: 24 }
  };

  function generate(opts) {
    var cols = SIZE_PRESETS[opts.size].cols;
    var rows = SIZE_PRESETS[opts.size].rows;
    var seed = opts.seed || 12345;
    var elevN = Util.makeNoise(seed);
    var moistN = Util.makeNoise(seed + 7777);
    var tempN = Util.makeNoise(seed + 22222);
    var rng = Util.makeRNG(seed + 5);

    var tiles = {};
    var allKeys = [];

    // 生成矩形区域（轴向坐标，每行偏移以形成矩形）
    for (var r = 0; r < rows; r++) {
      var qOff = -Math.floor(r / 2);
      for (var i = 0; i < cols; i++) {
        var q = qOff + i;
        var key = Util.axialKey(q, r);

        var lat = Math.abs(r - rows / 2) / (rows / 2); // 0 赤道 .. 1 极地
        var nx = q / cols * 3.2, ny = r / rows * 3.2;
        var e = Util.norm(elevN(nx, ny, 5, 0.5));
        // 边缘下沉，让四周多为海洋
        var edge = Math.max(Math.abs(q - cols / 2) / (cols / 2), Math.abs(r - rows / 2) / (rows / 2));
        e = e - Math.pow(edge, 3) * 0.35;
        e = Util.clamp(e, 0, 1);

        var m = Util.norm(moistN(nx + 10, ny + 10, 4, 0.5));
        var tNoise = Util.norm(tempN(nx - 5, ny - 5, 3, 0.5));
        var temp = Util.clamp((1 - lat) * 0.7 + tNoise * 0.3, 0, 1);

        var terrain, hills = false;
        if (e < 0.30) terrain = 'ocean';
        else if (e < 0.355) terrain = 'coast';
        else {
          if (e > 0.80) terrain = 'mountain';
          else {
            hills = e > 0.66;
            if (temp < 0.22) terrain = 'snow';
            else if (temp < 0.40) terrain = 'tundra';
            else if (m < 0.28) terrain = 'desert';
            else if (m < 0.60) terrain = 'plains';
            else terrain = 'grassland';
          }
        }

        var tile = {
          q: q, r: r, terrain: terrain, hills: hills,
          feature: null, resource: null, improvement: null,
          river: false, elev: e, moist: m, temp: temp,
          water: Data.TERRAIN[terrain].water,
          owner: null, cityId: null, barbarianCamp: false
        };
        tiles[key] = tile;
        allKeys.push(key);
      }
    }

    var map = { tiles: tiles, allKeys: allKeys, cols: cols, rows: rows };

    // 清理被陆地包围的小水洼（<3 邻居且非海洋）—— 简单平滑
    smoothCoast(map);

    // 地貌
    placeFeatures(map, rng);
    // 资源
    placeResources(map, rng);
    // 河流
    placeRivers(map, rng);

    return map;
  }

  function smoothCoast(map) {
    // 若一格 ocean 的 6 邻居全是陆地，把它改为 grassland，避免孤水
    for (var k in map.tiles) {
      var t = map.tiles[k];
      if (t.terrain !== 'ocean') continue;
      var nbs = Util.neighbors(t.q, t.r, map);
      if (nbs.length === 6) {
        var landCount = 0;
        for (var i = 0; i < nbs.length; i++) if (!nbs[i].water) landCount++;
        if (landCount === 6) {
          t.terrain = 'grassland'; t.water = false; t.elev = 0.45;
        }
      }
    }
  }

  function placeFeatures(map, rng) {
    for (var k in map.tiles) {
      var t = map.tiles[k];
      if (t.water || t.terrain === 'mountain' || t.terrain === 'snow') continue;
      if (t.feature) continue;
      if (t.hills) {
        if (Util.chance(rng, 0.28)) t.feature = 'forest';
      } else {
        var tr = t.terrain;
        if (tr === 'grassland' && Util.chance(rng, 0.20)) t.feature = 'forest';
        else if (tr === 'plains') {
          if (Util.chance(rng, 0.12)) t.feature = 'forest';
          else if (Util.chance(rng, 0.16)) t.feature = 'rainforest';
        } else if (tr === 'floodplains' && Util.chance(rng, 0.5)) t.feature = 'marsh';
        else if (tr === 'desert' && Util.chance(rng, 0.04)) t.feature = 'oasis';
        else if (tr === 'tundra' && Util.chance(rng, 0.18)) t.feature = 'forest';
      }
    }
  }

  function placeResources(map, rng) {
    for (var k in map.tiles) {
      var t = map.tiles[k];
      // 海岸鱼
      if (t.terrain === 'coast' && Util.chance(rng, 0.18)) { t.resource = 'fish'; continue; }
      if (t.water || t.terrain === 'mountain' || t.terrain === 'snow') continue;
      if (Util.chance(rng, 0.16)) {
        var cand = pickResource(t, rng);
        if (cand) t.resource = cand;
      }
    }
  }

  function pickResource(t, rng) {
    var matches = [];
    var eff = t.terrain;
    if (t.hills) eff = 'hills';
    for (var rk in Data.RESOURCE) {
      var res = Data.RESOURCE[rk];
      if (res.terrains.indexOf(eff) >= 0) matches.push(rk);
    }
    if (!matches.length) return null;
    return matches[Math.floor(rng() * matches.length)];
  }

  function placeRivers(map, rng) {
    // 从山脉出发，沿最低高度走到水，沿途标记 river
    var mountains = [];
    for (var k in map.tiles) {
      var t = map.tiles[k];
      if (t.terrain === 'mountain') mountains.push(t);
    }
    var count = Math.min(mountains.length, Math.floor(map.cols * map.rows / 60));
    Util.shuffle = Util.shuffle || function () {};
    for (var i = 0; i < count; i++) {
      var src = mountains[Math.floor(rng() * mountains.length)];
      walkRiver(map, src, rng);
    }
  }

  function walkRiver(map, src, rng) {
    var cur = src;
    var steps = 0;
    while (cur && steps < 30) {
      steps++;
      var nbs = Util.neighbors(cur.q, cur.r, map);
      if (!nbs.length) return;
      nbs.sort(function (a, b) { return a.elev - b.elev; });
      var lowest = nbs[0];
      if (lowest.water) { cur.river = true; return; }
      if (lowest.elev >= cur.elev) {
        // 选随机低处或停止
        var idx = Math.floor(rng() * Math.min(2, nbs.length));
        lowest = nbs[idx];
      }
      cur.river = true;
      if (lowest.terrain === 'mountain') return;
      cur = lowest;
    }
  }

  // 该地块是否提供淡水（沿河/邻河/邻山泉/绿洲）
  function isFreshWater(t, map) {
    if (!t) return false;
    if (t.river) return true;
    if (t.feature === 'oasis') return true;
    var nbs = Util.neighbors(t.q, t.r, map);
    for (var i = 0; i < nbs.length; i++) if (nbs[i].river) return true;
    return false;
  }

  // 该格是否临海
  function isCoastal(t, map) {
    if (t.water) return false;
    var nbs = Util.neighbors(t.q, t.r, map);
    for (var i = 0; i < nbs.length; i++) if (nbs[i].water) return true;
    return false;
  }

  // 计算实际产出（地形+地貌+资源+改良）
  function tileYields(t, civ) {
    var y = Data.TERRAIN[t.terrain].yield.slice();
    if (t.hills) y[1] += 1; // 丘陵 +1 产能
    if (t.feature && Data.FEATURE[t.feature]) {
      var fy = Data.FEATURE[t.feature].dYield;
      for (var i = 0; i < 5; i++) y[i] += fy[i];
    }
    // 资源：需已揭示（或加成资源）
    if (t.resource) {
      var res = Data.RESOURCE[t.resource];
      var revealed = !res.reveal || (civ && civ.techs[res.reveal]);
      if (revealed) {
        var ry = res.dYield;
        for (var j = 0; j < 5; j++) y[j] += ry[j];
      }
    }
    // 改良
    if (t.improvement && Data.IMPROVE[t.improvement]) {
      var imp = Data.IMPROVE[t.improvement];
      var iy = imp.dYield;
      for (var m = 0; m < 5; m++) y[m] += iy[m];
    }
    return y;
  }

  return {
    generate: generate, isFreshWater: isFreshWater, isCoastal: isCoastal,
    tileYields: tileYields, SIZE_PRESETS: SIZE_PRESETS
  };
})();
