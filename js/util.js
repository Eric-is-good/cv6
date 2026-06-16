// ===== 工具函数：随机数、六边形数学、噪声、通用辅助 =====
var Util = (function () {
  'use strict';

  // 可设种子的伪随机数发生器 (mulberry32)
  function makeRNG(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function chance(rng, p) { return rng() < p; }

  // ---- 六边形数学（尖顶六边形，轴向坐标 q,r）----
  // 六个方向的邻居
  var HEX_DIRS = [
    { q: +1, r: 0 }, { q: +1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: +1 }, { q: 0, r: +1 }
  ];

  function axialKey(q, r) { return q + ',' + r; }

  function axialToPixel(q, r, size) {
    var x = size * Math.sqrt(3) * (q + r / 2);
    var y = size * 1.5 * r;
    return { x: x, y: y };
  }

  function pixelToAxial(x, y, size) {
    var q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
    var r = (2 / 3 * y) / size;
    return axialRound(q, r);
  }

  function axialRound(q, r) {
    var s = -q - r;
    var rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    var dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  }

  function hexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  }

  // 六个顶点（用于绘制）
  function hexCorners(cx, cy, size) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var angle = Math.PI / 180 * (60 * i - 30);
      pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
    }
    return pts;
  }

  // 计算某格的所有有效邻居
  function neighbors(q, r, map) {
    var out = [];
    for (var i = 0; i < 6; i++) {
      var d = HEX_DIRS[i];
      var k = axialKey(q + d.q, r + d.r);
      if (map.tiles[k]) out.push(map.tiles[k]);
    }
    return out;
  }

  // ---- 简单 2D 值噪声（带种子、可叠加八度）----
  function makeNoise(seed) {
    var rng = makeRNG(seed);
    var perm = new Array(512);
    var p = [];
    for (var i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function grad(hash, x, y) {
      var h = hash & 7;
      var u = h < 4 ? x : y;
      var v = h < 4 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    }
    function noise2(x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      var u = fade(x), v = fade(y);
      var aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
      var ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
      var x1 = lerp(grad(aa, x, y), grad(ba, x - 1, y), u);
      var x2 = lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u);
      return lerp(x1, x2, v); // 约 [-1,1]
    }
    return function (x, y, octaves, persistence) {
      octaves = octaves || 4;
      persistence = persistence || 0.5;
      var total = 0, freq = 1, amp = 1, max = 0;
      for (var i = 0; i < octaves; i++) {
        total += noise2(x * freq, y * freq) * amp;
        max += amp; amp *= persistence; freq *= 2;
      }
      return total / max; // 约 [-1,1]
    };
  }

  // 把 [-1,1] 噪声映射到 [0,1]
  function norm(n) { return clamp((n + 1) / 2, 0, 1); }

  // 深拷贝简单对象
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // 四舍五入到一位
  function round1(v) { return Math.round(v * 10) / 10; }

  // 广度优先：从某格出发获取距离内的所有格子
  function floodFill(map, start, maxDist, passable) {
    var seen = {};
    var key = axialKey(start.q, start.r);
    seen[key] = 0;
    var queue = [{ q: start.q, r: start.r, d: 0 }];
    var result = [];
    while (queue.length) {
      var cur = queue.shift();
      result.push({ q: cur.q, r: cur.r, d: cur.d });
      if (cur.d >= maxDist) continue;
      var nbs = neighbors(cur.q, cur.r, map);
      for (var i = 0; i < nbs.length; i++) {
        var n = nbs[i];
        var nk = axialKey(n.q, n.r);
        if (seen[nk] !== undefined) continue;
        if (passable && !passable(n)) continue;
        seen[nk] = cur.d + 1;
        queue.push({ q: n.q, r: n.r, d: cur.d + 1 });
      }
    }
    return result;
  }

  return {
    makeRNG: makeRNG, clamp: clamp, lerp: lerp, randInt: randInt, chance: chance,
    HEX_DIRS: HEX_DIRS, axialKey: axialKey, axialToPixel: axialToPixel,
    pixelToAxial: pixelToAxial, hexDistance: hexDistance, hexCorners: hexCorners,
    neighbors: neighbors, makeNoise: makeNoise, norm: norm, clone: clone,
    round1: round1, floodFill: floodFill
  };
})();
