// 地图生成
import { TERRAINS, RESOURCES } from './data.js';
import { mulberry32, valueNoise2D, fbm } from './rand.js';
import { hexKey, hexNeighbors, hexDistance } from './hex.js';

export function generateMap({ radius = 18, seed = 12345 } = {}) {
  const rand = mulberry32(seed);
  const elevNoise = valueNoise2D((seed * 2654435761) >>> 0);
  const moistNoise = valueNoise2D((seed * 40503) >>> 0);

  const tiles = new Map();

  // 矩形地图：宽 2R+1, 高 2R+1; 使用 axial offset
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      // 让边角是水
      const distEdge = Math.min(radius - Math.abs(r), radius - Math.abs(q));
      const elev = fbm((x, y) => elevNoise(x, y), (q + 50) * 0.12, (r + 50) * 0.12, 4);
      const moist = fbm((x, y) => moistNoise(x, y), (q - 30) * 0.15, (r - 30) * 0.15, 3);
      // 边缘海化
      const e = elev * (distEdge / radius);
      let terrain;
      if (e < 0.22) terrain = 'ocean';
      else if (e < 0.28) terrain = 'coast';
      else {
        const lat = Math.abs(r) / radius;
        if (lat > 0.85) terrain = 'snow';
        else if (lat > 0.7) terrain = e > 0.55 ? 'mountain' : 'tundra';
        else if (e > 0.65) terrain = 'mountain';
        else if (e > 0.5) terrain = 'hill';
        else if (moist < 0.32 && lat < 0.55) terrain = 'desert';
        else if (moist > 0.7 && lat < 0.5) terrain = 'jungle';
        else if (moist > 0.55) terrain = 'forest';
        else if (moist < 0.45) terrain = 'plain';
        else terrain = 'grass';
      }

      tiles.set(hexKey(q, r), {
        q, r, terrain,
        resource: null,
        improvement: null,
        owner: null,
        city: null,
        unit: null,
        cityWorked: null,  // 城市 id
        road: false,
      });
    }
  }

  // 海岸修正：把贴着陆地的 ocean 改成 coast
  for (const t of tiles.values()) {
    if (t.terrain !== 'ocean') continue;
    const nbs = hexNeighbors(t.q, t.r).map(n => tiles.get(hexKey(n.q, n.r))).filter(Boolean);
    if (nbs.some(n => TERRAINS[n.terrain].passable)) t.terrain = 'coast';
  }

  // 撒资源
  const resKeys = Object.keys(RESOURCES);
  for (const t of tiles.values()) {
    if (rand() > 0.10) continue;
    const cand = resKeys.filter(r => RESOURCES[r].terrain.includes(t.terrain));
    if (!cand.length) continue;
    t.resource = cand[Math.floor(rand() * cand.length)];
  }

  return { tiles, radius, seed };
}

export function tileYield(tile) {
  const T = TERRAINS[tile.terrain];
  const y = { food: T.food || 0, prod: T.prod || 0, gold: T.gold || 0, sci: T.sci || 0, cult: 0, faith: 0 };
  if (tile.resource) {
    const R = RESOURCES[tile.resource];
    for (const k in R.yield) y[k] = (y[k] || 0) + R.yield[k];
  }
  if (tile.improvement) {
    const I = tile.improvement;
    for (const k in I.yield || {}) y[k] = (y[k] || 0) + I.yield[k];
  }
  return y;
}

// 找一块好的起始地
export function findStart(map, takenList, rand) {
  for (const minDist of [10, 8, 6, 4, 2]) {
    const candidates = [];
    for (const t of map.tiles.values()) {
      const T = TERRAINS[t.terrain];
      if (!T.passable || t.terrain === 'mountain') continue;
      if (t.terrain === 'snow' || t.terrain === 'desert') continue;
      const nbs = hexNeighbors(t.q, t.r)
        .map(n => map.tiles.get(hexKey(n.q, n.r)))
        .filter(Boolean);
      let landNb = 0, score = 0;
      for (const n of nbs) {
        const TN = TERRAINS[n.terrain];
        if (TN.passable) landNb++;
        if (n.terrain === 'grass' || n.terrain === 'plain') score += 2;
        if (n.terrain === 'hill' || n.terrain === 'forest') score += 1;
        if (n.resource) score += 2;
      }
      if (landNb < 3) continue;
      if (takenList.some(s => hexDistance(s, t) < minDist)) continue;
      candidates.push({ t, score: score + rand() });
    }
    if (!candidates.length) continue;
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, Math.min(5, candidates.length));
    return top[Math.floor(rand() * top.length)].t;
  }
  return null;
}
