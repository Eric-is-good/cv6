// 六边形工具：axial 坐标，pointy-top
// q = column-ish, r = row-ish. 转 cube: x=q, z=r, y=-x-z.

export const SQRT3 = Math.sqrt(3);

// 六个方向
export const HEX_DIRS = [
  { q: +1, r:  0 }, { q: +1, r: -1 }, { q:  0, r: -1 },
  { q: -1, r:  0 }, { q: -1, r: +1 }, { q:  0, r: +1 },
];

export function hexKey(q, r) { return `${q},${r}`; }
export function parseKey(k) { const [q, r] = k.split(',').map(Number); return { q, r }; }

export function hexNeighbors(q, r) {
  return HEX_DIRS.map(d => ({ q: q + d.q, r: r + d.r }));
}

export function hexDistance(a, b) {
  const aq = a.q, ar = a.r, as = -aq - ar;
  const bq = b.q, br = b.r, bs = -bq - br;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

// 像素：pointy-top
export function hexToPixel(q, r, size) {
  const x = size * SQRT3 * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
}

export function pixelToHex(x, y, size) {
  const q = (SQRT3 / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;
  return hexRound(q, r);
}

function hexRound(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export function hexCorner(cx, cy, size, i) {
  const angle = Math.PI / 180 * (60 * i - 30);
  return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
}

// 在半径 R 内的所有格子（轴向）
export function hexesInRange(center, R) {
  const out = [];
  for (let dq = -R; dq <= R; dq++) {
    for (let dr = Math.max(-R, -dq - R); dr <= Math.min(R, -dq + R); dr++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}
