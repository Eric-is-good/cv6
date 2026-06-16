// Canvas 渲染：地图、单位、城市、UI 覆盖层
import { TERRAINS, RESOURCES, UNITS } from './data.js';
import { hexKey, hexToPixel, hexCorner, hexNeighbors } from './hex.js';

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.hexSize = 28;          // 像素半径
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.selected = null;       // {type:'unit'|'city', id} 由外部 ui 控制
    this.movePreview = null;    // 可到达格子 Set(key)
    this.attackPreview = null;  // 可攻击格子 Set(key)
    this.path = null;
    this.hoverHex = null;
    this.resizeToFit();
    window.addEventListener('resize', () => this.resizeToFit());
  }

  resizeToFit() {
    const wrap = this.canvas.parentElement;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.camera.x) * this.camera.zoom + this.canvas.width / 2,
      y: (wy - this.camera.y) * this.camera.zoom + this.canvas.height / 2,
    };
  }
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.canvas.width / 2) / this.camera.zoom + this.camera.x,
      y: (sy - this.canvas.height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  centerOnHex(q, r) {
    const p = hexToPixel(q, r, this.hexSize);
    this.camera.x = p.x; this.camera.y = p.y;
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const map = this.game.map;
    const human = this.game.humanCiv();

    // 视野计算：基于人类玩家
    const visible = this.game.visibleTilesFor(human);
    const explored = human.exploredTiles;

    // 先画地形
    for (const t of map.tiles.values()) {
      const key = hexKey(t.q, t.r);
      if (!explored.has(key)) continue;
      this.drawHex(t, visible.has(key));
    }

    // 城市轮廓 (owner border)
    for (const t of map.tiles.values()) {
      const key = hexKey(t.q, t.r);
      if (!explored.has(key) || t.owner == null) continue;
      this.drawOwnerEdges(t);
    }

    // 城市
    for (const city of this.game.cities) {
      const key = hexKey(city.q, city.r);
      if (!explored.has(key)) continue;
      this.drawCity(city);
    }

    // 单位（只画当前可见）
    for (const u of this.game.units) {
      const key = hexKey(u.q, u.r);
      if (!visible.has(key)) continue;
      this.drawUnit(u);
    }

    // 选中高亮
    if (this.selected) {
      const sel = this.getSelectedEntity();
      if (sel) {
        const p = this.hexCenter(sel.q, sel.r);
        this.drawHexRing(p.x, p.y, '#f5d36b', 3);
      }
    }
    if (this.movePreview) {
      for (const k of this.movePreview) {
        const [q, r] = k.split(',').map(Number);
        const p = this.hexCenter(q, r);
        this.drawHexFill(p.x, p.y, 'rgba(143,207,107,0.22)');
        this.drawHexRing(p.x, p.y, 'rgba(143,207,107,0.6)', 1.5);
      }
    }
    if (this.attackPreview) {
      for (const k of this.attackPreview) {
        const [q, r] = k.split(',').map(Number);
        const p = this.hexCenter(q, r);
        this.drawHexFill(p.x, p.y, 'rgba(232,122,122,0.30)');
        this.drawHexRing(p.x, p.y, 'rgba(232,122,122,0.9)', 1.5);
      }
    }
    if (this.hoverHex) {
      const p = this.hexCenter(this.hoverHex.q, this.hoverHex.r);
      this.drawHexRing(p.x, p.y, '#ffffff66', 1);
    }
  }

  hexCenter(q, r) {
    const w = hexToPixel(q, r, this.hexSize);
    return this.worldToScreen(w.x, w.y);
  }

  drawHex(tile, isVisible) {
    const ctx = this.ctx;
    const p = this.hexCenter(tile.q, tile.r);
    const sz = this.hexSize * this.camera.zoom;
    if (p.x < -sz || p.y < -sz || p.x > this.canvas.width + sz || p.y > this.canvas.height + sz) return;

    const T = TERRAINS[tile.terrain];
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const c = hexCorner(p.x, p.y, sz, i);
      if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
    }
    ctx.closePath();
    ctx.fillStyle = T.color;
    ctx.fill();
    if (!isVisible) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();
    }
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();

    // 资源 emoji
    if (tile.resource && sz > 14) {
      const R = RESOURCES[tile.resource];
      ctx.font = `${Math.floor(sz * 0.6)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(R.icon, p.x, p.y + sz * 0.05);
    }
    // 改良
    if (tile.improvement && sz > 16) {
      ctx.font = `${Math.floor(sz * 0.4)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('⚙', p.x - sz * 0.5, p.y - sz * 0.4);
    }
  }

  drawHexFill(x, y, color) {
    const ctx = this.ctx;
    const sz = this.hexSize * this.camera.zoom;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const c = hexCorner(x, y, sz, i);
      if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
    }
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }
  drawHexRing(x, y, color, w = 2) {
    const ctx = this.ctx;
    const sz = this.hexSize * this.camera.zoom;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const c = hexCorner(x, y, sz, i);
      if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
    }
    ctx.closePath();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }

  drawOwnerEdges(tile) {
    const ctx = this.ctx;
    const civ = this.game.civs.find(c => c.id === tile.owner);
    if (!civ) return;
    const p = this.hexCenter(tile.q, tile.r);
    const sz = this.hexSize * this.camera.zoom;
    const nbs = hexNeighbors(tile.q, tile.r);
    ctx.strokeStyle = civ.color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const nb = nbs[i];
      const nbTile = this.game.map.tiles.get(hexKey(nb.q, nb.r));
      if (nbTile && nbTile.owner === tile.owner) continue;
      const c1 = hexCorner(p.x, p.y, sz, i);
      const c2 = hexCorner(p.x, p.y, sz, (i + 1) % 6);
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    }
  }

  drawCity(city) {
    const ctx = this.ctx;
    const civ = this.game.civs.find(c => c.id === city.civId);
    const p = this.hexCenter(city.q, city.r);
    const sz = this.hexSize * this.camera.zoom;
    // 底盘
    ctx.fillStyle = civ.color;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz * 0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 旗
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, Math.floor(sz * 0.55))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(city.pop, p.x, p.y);
    // 名字
    ctx.fillStyle = '#fff7d6';
    ctx.font = `${Math.max(10, Math.floor(sz * 0.4))}px sans-serif`;
    ctx.fillText(city.name, p.x, p.y - sz * 0.95);
    // hp bar (if damaged)
    if (city.hp < city.maxHp) {
      const bw = sz * 1.2, bh = 4;
      ctx.fillStyle = '#000';
      ctx.fillRect(p.x - bw/2, p.y + sz * 0.7, bw, bh);
      ctx.fillStyle = '#e87a7a';
      ctx.fillRect(p.x - bw/2, p.y + sz * 0.7, bw * (city.hp / city.maxHp), bh);
    }
  }

  drawUnit(unit) {
    const ctx = this.ctx;
    const civ = this.game.civs.find(c => c.id === unit.civId);
    const U = UNITS[unit.type];
    const p = this.hexCenter(unit.q, unit.r);
    const sz = this.hexSize * this.camera.zoom;
    // 同格如果有城市，则单位画在右下
    const offY = this.game.cityAt(unit.q, unit.r) ? sz * 0.55 : 0;
    ctx.fillStyle = civ.color;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y + offY, sz * 0.36, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.font = `${Math.floor(sz * 0.45)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(U.icon, p.x, p.y + offY);
    // HP
    if (U.hp > 0 && unit.hp < U.hp) {
      const bw = sz * 0.8, bh = 3;
      ctx.fillStyle = '#000'; ctx.fillRect(p.x - bw/2, p.y + offY + sz * 0.5, bw, bh);
      ctx.fillStyle = '#8fcf6b'; ctx.fillRect(p.x - bw/2, p.y + offY + sz * 0.5, bw * (unit.hp / U.hp), bh);
    }
    // 行动力剩余指示
    if (unit.movesLeft <= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(p.x, p.y + offY, sz * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
