// ===== 渲染：六边形地图、单位、城市、迷雾 =====
var Render = (function () {
  'use strict';

  var BASE = 46; // 基础六边形半径
  var dirty = true;
  var hoverKey = null;
  var t0 = 0;

  function markDirty() { dirty = true; }

  function ctx() { return G.canvas.getContext('2d'); }

  function size() { return BASE * G.cam.zoom; }

  function hexToScreen(q, r) {
    var p = Util.axialToPixel(q, r, BASE);
    return { x: p.x * G.cam.zoom + G.cam.x, y: p.y * G.cam.zoom + G.cam.y };
  }

  function screenToHex(mx, my) {
    var x = (mx - G.cam.x) / G.cam.zoom;
    var y = (my - G.cam.y) / G.cam.zoom;
    return Util.pixelToAxial(x, y, BASE);
  }

  function centerOn(q, r) {
    var p = Util.axialToPixel(q, r, BASE);
    G.cam.x = G.canvas.width / 2 - p.x * G.cam.zoom;
    G.cam.y = G.canvas.height / 2 - p.y * G.cam.zoom;
    markDirty();
  }

  function fitMap() {
    // 计算地图包围盒并适配
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (var k in G.map.tiles) {
      var p = Util.axialToPixel(G.map.tiles[k].q, G.map.tiles[k].r, BASE);
      if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
    }
    var w = maxx - minx + BASE * 2, h = maxy - miny + BASE * 2;
    var zx = G.canvas.width / w, zy = G.canvas.height / h;
    G.cam.zoom = Math.min(zx, zy) * 0.95;
    G.cam.zoom = Util.clamp(G.cam.zoom, 0.3, 1.4);
    G.cam.x = G.canvas.width / 2 - (minx + maxx) / 2 * G.cam.zoom;
    G.cam.y = G.canvas.height / 2 - (miny + maxy) / 2 * G.cam.zoom;
    markDirty();
  }

  function draw() {
    if (!G.map) return;
    var c = ctx();
    var W = G.canvas.width, H = G.canvas.height;
    c.fillStyle = '#0a0f14';
    c.fillRect(0, 0, W, H);
    var s = size();
    var reach = G.sel ? G.sel.reach : null;
    var attacks = G.sel ? G.sel.attacks : null;
    var selUnit = G.sel && G.sel.unit;
    var showYields = G.showYields;

    // ---- 第一遍：地形 ----
    for (var k in G.map.tiles) {
      var t = G.map.tiles[k];
      if (!Visibility.isRevealed(0, k)) continue;
      var scr = hexToScreen(t.q, t.r);
      if (scr.x < -s * 2 || scr.x > W + s * 2 || scr.y < -s * 2 || scr.y > H + s * 2) continue;
      drawTile(c, t, scr, s);
    }

    // ---- 领土填色（半透明） ----
    for (var k2 in G.map.tiles) {
      var t2 = G.map.tiles[k2];
      if (!Visibility.isRevealed(0, k2)) continue;
      if (t2.owner == null) continue;
      var sc2 = hexToScreen(t2.q, t2.r);
      var col = civColor(t2.owner);
      c.save();
      pathHex(c, sc2.x, sc2.y, s * 0.98);
      c.globalAlpha = 0.16;
      c.fillStyle = col;
      c.fill();
      c.restore();
    }

    // ---- 改良/资源/产出 ----
    for (var k3 in G.map.tiles) {
      var t3 = G.map.tiles[k3];
      if (!Visibility.isRevealed(0, k3)) continue;
      if (!t3.improvement && !showVisibleResource(t3)) continue;
      drawImprovement(c, t3, hexToScreen(t3.q, t3.r), s);
    }

    // ---- 城市 ----
    for (var ci = 0; ci < G.cities.length; ci++) {
      var city = G.cities[ci];
      if (!city) continue;
      var ck = Util.axialKey(city.q, city.r);
      if (!Visibility.isRevealed(0, ck)) continue;
      drawCity(c, city, hexToScreen(city.q, city.r), s);
    }

    // ---- 蛮族营地 ----
    for (var bi = 0; bi < G.camps.length; bi++) {
      var camp = G.camps[bi];
      var ctk = Util.axialKey(camp.q, camp.r);
      if (!Visibility.isRevealed(0, ctk)) continue;
      drawCamp(c, hexToScreen(camp.q, camp.r), s);
    }

    // ---- 选中高亮 & 可达 ----
    if (selUnit) {
      var selScr = hexToScreen(selUnit.q, selUnit.r);
      pathHex(c, selScr.x, selScr.y, s * 0.96);
      c.strokeStyle = '#ffe27a'; c.lineWidth = 3; c.stroke();
    }
    if (reach) {
      for (var rk in reach) {
        var rt = G.map.tiles[rk];
        if (!rt) continue;
        if (!Visibility.isVisible(0, rk)) continue;
        var rs = hexToScreen(rt.q, rt.r);
        c.save();
        pathHex(c, rs.x, rs.y, s * 0.82);
        c.fillStyle = 'rgba(90,180,255,0.28)'; c.fill();
        c.restore();
      }
    }
    if (attacks) {
      for (var ai = 0; ai < attacks.length; ai++) {
        var at = G.map.tiles[Util.axialKey(attacks[ai].q, attacks[ai].r)];
        if (!at) continue;
        var as2 = hexToScreen(at.q, at.r);
        c.save();
        pathHex(c, as2.x, as2.y, s * 0.92);
        c.strokeStyle = '#ff5a5a'; c.lineWidth = 3; c.stroke();
        c.restore();
      }
    }

    // ---- 单位 ----
    for (var ui = 0; ui < G.units.length; ui++) {
      var u = G.units[ui];
      var uk = Util.axialKey(u.q, u.r);
      if (!Visibility.isVisible(0, uk)) continue;
      if (u.civ !== -1 && u.civ !== 0 && !Visibility.isVisible(0, uk)) continue;
      drawUnit(c, u, hexToScreen(u.q, u.r), s);
    }

    // ---- 迷雾（已发现但当前不可见） ----
    for (var fk in G.map.tiles) {
      if (Visibility.isRevealed(0, fk) && !Visibility.isVisible(0, fk)) {
        var ft = G.map.tiles[fk];
        var fs = hexToScreen(ft.q, ft.r);
        if (fs.x < -s * 2 || fs.x > W + s * 2) continue;
        c.save();
        pathHex(c, fs.x, fs.y, s * 0.99);
        c.fillStyle = 'rgba(8,12,18,0.5)'; c.fill();
        c.restore();
      }
    }

    // ---- 悬停提示 ----
    if (hoverKey && G.map.tiles[hoverKey] && Visibility.isRevealed(0, hoverKey)) {
      drawTooltip(c, G.map.tiles[hoverKey]);
    }
  }

  function pathHex(c, cx, cy, s) {
    var pts = Util.hexCorners(cx, cy, s);
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < 6; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }

  function drawTile(c, t, scr, s) {
    var base = Data.TERRAIN[t.terrain].color;
    pathHex(c, scr.x, scr.y, s);
    c.fillStyle = base; c.fill();
    // 丘陵：加深
    if (t.hills) {
      c.save(); pathHex(c, scr.x, scr.y, s); c.globalAlpha = 0.16; c.fillStyle = '#000'; c.fill(); c.restore();
    }
    // 边框
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.25)'; c.stroke();
    // 地貌
    if (t.feature === 'forest') drawTrees(c, scr, s, '#3f7d3a');
    else if (t.feature === 'rainforest') drawTrees(c, scr, s, '#2f6b2a', true);
    else if (t.feature === 'marsh') drawDots(c, scr, s, '#6b8e3a');
    else if (t.feature === 'oasis') { c.beginPath(); c.arc(scr.x, scr.y, s * 0.28, 0, 7); c.fillStyle = '#3aa6a0'; c.fill(); }
    // 河流标记
    if (t.river) {
      c.fillStyle = '#3a7fb5'; c.font = (s * 0.3) + 'px sans-serif'; c.textAlign = 'center';
      c.fillText('〜', scr.x + s * 0.3, scr.y - s * 0.35);
    }
  }

  function drawTrees(c, scr, s, col, dense) {
    var n = dense ? 4 : 3;
    c.fillStyle = col;
    for (var i = 0; i < n; i++) {
      var px = scr.x + (i - 1) * s * 0.32 + (dense ? 0 : 0);
      var py = scr.y + s * 0.1;
      c.beginPath();
      c.moveTo(px, py - s * 0.28);
      c.lineTo(px - s * 0.14, py + s * 0.06);
      c.lineTo(px + s * 0.14, py + s * 0.06);
      c.closePath(); c.fill();
    }
  }
  function drawDots(c, scr, s, col) {
    c.fillStyle = col;
    for (var i = 0; i < 5; i++) {
      c.beginPath();
      c.arc(scr.x + (i % 3 - 1) * s * 0.25, scr.y + Math.floor(i / 3) * s * 0.2, s * 0.06, 0, 7);
      c.fill();
    }
  }

  function showVisibleResource(t) {
    if (!t.resource) return false;
    var res = Data.RESOURCE[t.resource];
    if (res.type === 'bonus') return true;
    return res.reveal && G.civs[0].techs[res.reveal];
  }

  function drawImprovement(c, t, scr, s) {
    if (t.improvement) {
      c.fillStyle = '#d9c47a';
      c.font = (s * 0.34) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(improveGlyph(t.improvement), scr.x, scr.y + s * 0.32);
    }
    if (showVisibleResource(t)) {
      c.fillStyle = resourceColor(t.resource);
      c.font = (s * 0.3) + 'px sans-serif'; c.textAlign = 'center';
      c.fillText(resourceGlyph(t.resource), scr.x - s * 0.3, scr.y - s * 0.18);
    }
    if (G.showYields) drawYields(c, t, scr, s);
  }

  function drawYields(c, t, scr, s) {
    var y = MapGen.tileYields(t, G.civs[0]);
    var labels = ['🌾', '⛏', '💰', '🔬', '🎭'];
    var parts = '';
    for (var i = 0; i < 5; i++) if (y[i] > 0) parts += labels[i] + y[i] + ' ';
    if (!parts) return;
    c.save();
    c.font = (s * 0.26) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    var w = c.measureText(parts).width;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(scr.x - w / 2 - 3, scr.y + s * 0.5, w + 6, s * 0.32);
    c.fillStyle = '#fff';
    c.fillText(parts, scr.x, scr.y + s * 0.66);
    c.restore();
  }

  function improveGlyph(k) {
    return { farm: '⌂', mine: '▲', pasture: '✦', quarry: '◆', plantation: '☘', fishing: '⚓' }[k] || '·';
  }
  function resourceGlyph(k) {
    return { wheat: '麦', rice: '米', cattle: '牛', stone: '石', fish: '鱼', copper: '铜',
      horses: '马', iron: '铁', niter: '硝', spices: '香', silk: '丝', gems: '宝' }[k] || '?';
  }
  function resourceColor(k) {
    var res = Data.RESOURCE[k];
    if (!res) return '#fff';
    return res.type === 'strategic' ? '#ff8b6b' : res.type === 'luxury' ? '#c08bf0' : '#fff';
  }

  function civColor(id) {
    if (id === -1) return '#6b4f3a';
    return G.civs[id] ? G.civs[id].color : '#888';
  }

  function drawCity(c, city, scr, s) {
    var col = civColor(city.civ);
    // 底座
    c.beginPath();
    c.arc(scr.x, scr.y + s * 0.05, s * 0.42, 0, 7);
    c.fillStyle = col; c.fill();
    c.lineWidth = 2; c.strokeStyle = city.capital ? '#ffe27a' : '#fff'; c.stroke();
    // 城堡符号
    c.fillStyle = '#fff';
    c.font = 'bold ' + (s * 0.42) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('⌂', scr.x, scr.y + s * 0.05);
    // 名称与人口
    var label = city.name + (city.capital ? '★' : '') + ' (' + city.pop + ')';
    c.font = (s * 0.3) + 'px sans-serif';
    var w = c.measureText(label).width;
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(scr.x - w / 2 - 4, scr.y - s * 0.62, w + 8, s * 0.36);
    c.fillStyle = '#fff'; c.textBaseline = 'middle';
    c.fillText(label, scr.x, scr.y - s * 0.44);
    // HP 条（受损时）
    if (city.hp < city.maxHp) {
      var pct = city.hp / city.maxHp;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(scr.x - s * 0.4, scr.y + s * 0.5, s * 0.8, 4);
      c.fillStyle = pct > 0.5 ? '#5dbb63' : '#d9534f';
      c.fillRect(scr.x - s * 0.4, scr.y + s * 0.5, s * 0.8 * pct, 4);
    }
  }

  function drawCamp(c, scr, s) {
    c.fillStyle = '#5a4030';
    c.font = (s * 0.5) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('⛺', scr.x, scr.y);
  }

  function drawUnit(c, u, scr, s) {
    var d = Units.def(u);
    var col = civColor(u.civ);
    var r = s * 0.34;
    // 阴影
    c.beginPath(); c.arc(scr.x, scr.y + s * 0.12, r, 0, 7);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    // 主体
    c.beginPath(); c.arc(scr.x, scr.y - s * 0.05, r, 0, 7);
    c.fillStyle = '#1a2330'; c.fill();
    c.lineWidth = 3; c.strokeStyle = col; c.stroke();
    // 字
    c.fillStyle = Units.isMilitary(u) ? col : '#fff';
    c.font = 'bold ' + (s * 0.36) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(d.glyph, scr.x, scr.y - s * 0.04);
    // HP
    if (u.hp < 100) {
      var pct = u.hp / 100;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(scr.x - r, scr.y - s * 0.05 - r - 6, r * 2, 4);
      c.fillStyle = pct > 0.5 ? '#5dbb63' : '#d9534f';
      c.fillRect(scr.x - r, scr.y - s * 0.05 - r - 6, r * 2 * pct, 4);
    }
    // 移动力指示（己方且仍有行动）
    if (u.civ === 0) {
      if (u.moves > 0 && !u.fortified) {
        c.beginPath(); c.arc(scr.x + r * 0.8, scr.y - s * 0.05 - r * 0.8, s * 0.08, 0, 7);
        c.fillStyle = '#ffe27a'; c.fill();
      } else if (u.fortified) {
        c.fillStyle = '#7fd3ff'; c.font = (s * 0.22) + 'px sans-serif';
        c.fillText('🛡', scr.x + r * 0.9, scr.y - s * 0.05 - r * 0.8);
      }
    }
  }

  function drawTooltip(c, t) {
    var lines = [];
    lines.push(Data.TERRAIN[t.terrain].name + (t.hills ? ' · 丘陵' : '') + (t.feature ? ' · ' + Data.FEATURE[t.feature].name : ''));
    if (showVisibleResource(t)) lines.push('资源：' + Data.RESOURCE[t.resource].name);
    if (t.improvement) lines.push('改良：' + Data.IMPROVE[t.improvement].name);
    var y = MapGen.tileYields(t, G.civs[0]);
    var labels = ['食', '产', '金', '科', '文'];
    var ystr = '';
    for (var i = 0; i < 5; i++) if (y[i] > 0) ystr += labels[i] + y[i] + ' ';
    lines.push('产出：' + (ystr || '—'));
    if (t.owner != null) lines.push('归属：' + (t.owner === -1 ? '蛮族' : G.civs[t.owner].name));
    var scr = hexToScreen(t.q, t.r);
    c.save();
    c.font = '13px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    var w = 0;
    for (var i2 = 0; i2 < lines.length; i2++) w = Math.max(w, c.measureText(lines[i2]).width);
    var bx = scr.x + size() * 0.7, by = scr.y - size() * 0.7;
    if (bx + w + 16 > G.canvas.width) bx = scr.x - w - size() * 0.7 - 16;
    c.fillStyle = 'rgba(10,15,20,0.92)';
    c.fillRect(bx, by, w + 16, lines.length * 18 + 10);
    c.strokeStyle = '#d9a441'; c.lineWidth = 1; c.strokeRect(bx, by, w + 16, lines.length * 18 + 10);
    c.fillStyle = '#e8edf2';
    for (var j = 0; j < lines.length; j++) c.fillText(lines[j], bx + 8, by + 6 + j * 18);
    c.restore();
  }

  function setHover(k) { hoverKey = k; markDirty(); }

  function loop(time) {
    t0 = time || 0;
    if (dirty || (G.sel && G.sel.unit)) {
      dirty = false;
      draw();
    }
    requestAnimationFrame(loop);
  }

  function start() { requestAnimationFrame(loop); }

  return {
    markDirty: markDirty, centerOn: centerOn, fitMap: fitMap,
    screenToHex: screenToHex, hexToScreen: hexToScreen, size: size,
    setHover: setHover, start: start, draw: draw
  };
})();
