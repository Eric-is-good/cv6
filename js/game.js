// ===== 游戏主控：状态、初始化、回合循环、胜负 =====
var G = {
  canvas: null, map: null, civs: [], units: [], cities: [], camps: [],
  turn: 1, difficulty: null, sel: null, cam: { x: 0, y: 0, zoom: 1 },
  visible: {}, revealed: {}, log: [], over: false, showYields: false,
  nextUnitId: 1, nextCityId: 1, notifCount: 0
};
window.G = G;

var MAX_TURN = 250;

var Game = (function () {
  'use strict';

  function setupCanvas() {
    G.canvas = document.getElementById('map');
    function resize() {
      G.canvas.width = window.innerWidth;
      G.canvas.height = window.innerHeight;
      Render.markDirty();
    }
    resize();
    window.addEventListener('resize', resize);
  }

  function start(opts) {
    G.map = MapGen.generate({ size: opts.size, seed: (Math.random() * 1e9) | 0 });
    G.difficulty = Data.DIFFICULTY[opts.diff];
    G.civs = []; G.units = []; G.cities = []; G.camps = [];
    G.turn = 1; G.over = false; G.log = []; G.sel = null;
    G.nextUnitId = 1; G.nextCityId = 1; G.notifCount = 0;
    G.cam = { x: 0, y: 0, zoom: 1 };

    // 玩家文明
    G.civs.push({
      id: 0, name: opts.civName, leader: opts.leader, color: '#d9a441',
      isPlayer: true, isAlive: true, techs: {}, research: { id: null, progress: 0 },
      sciencePool: 0, culturePool: 0, gold: 30, researchedCount: 0, resourceCount: {}
    });
    // 野蛮人（作为 id=-1 的伪文明）
    G.civs[-1] = { id: -1, name: '蛮族', leader: '', color: '#6b4f3a', techs: {}, isAlive: true };

    // AI 文明
    var pool = Data.AI_CIVS.slice();
    for (var i = pool.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    var n = parseInt(opts.enemies, 10);
    var bonus = G.difficulty.aiBonus;
    for (var k = 0; k < n; k++) {
      var a = pool[k];
      G.civs.push({
        id: k + 1, name: a.name, leader: a.leader, color: a.color,
        isPlayer: false, isAlive: true, techs: {}, research: { id: null, progress: 0 },
        sciencePool: 0, culturePool: 0, gold: Math.round(30 * bonus), researchedCount: 0, resourceCount: {}, bonus: bonus
      });
      var avail = Tech.availableTechs(G.civs[k + 1]);
      if (avail.length) Tech.setResearch(G.civs[k + 1], Tech.suggestNext(G.civs[k + 1]));
    }

    // 起始位置
    var used = [];
    var pStart = findStart(G.map, used, true);
    placeStartUnits(0, pStart);
    used.push(pStart);
    for (var m = 1; m <= n; m++) {
      var s = findStart(G.map, used, false);
      if (s) { placeStartUnits(m, s); used.push(s); }
    }
    // 玩家默认研究
    var pavail = Tech.availableTechs(G.civs[0]);
    if (pavail.length) Tech.setResearch(G.civs[0], Tech.suggestNext(G.civs[0]));

    // 蛮族营地
    Barbarians.init(G.map, Util.makeRNG((Math.random() * 1e9) | 0), pStart);

    Visibility.recomputeAll();
    Render.fitMap();
    Render.centerOn(pStart.q, pStart.r);
    UI.updateTopbar();
    UI.notify('欢迎，' + G.civs[0].leader + '！选中开拓者建立你的第一座城市。', 'good');
    document.getElementById('startModal').classList.add('hidden');
    Render.markDirty();
  }

  function findStart(map, used, preferCenter) {
    var land = map.allKeys.map(function (k) { return map.tiles[k]; })
      .filter(function (t) { return !t.water && t.terrain !== 'mountain'; });
    var best = null, bestScore = -1e9;
    var centerPx = Util.axialToPixel(map.cols / 2 - Math.floor(map.rows / 4), map.rows / 2, 46);
    for (var i = 0; i < land.length; i++) {
      var t = land[i];
      var sc = scoreStart(t, map);
      var dmin = 1e9;
      for (var u = 0; u < used.length; u++) {
        dmin = Math.min(dmin, Util.hexDistance({ q: t.q, r: t.r }, { q: used[u].q, r: used[u].r }));
      }
      if (used.length && dmin < 8) continue;
      if (used.length) sc += Math.min(dmin, 14) * 0.7;
      else if (preferCenter) {
        var px = Util.axialToPixel(t.q, t.r, 46);
        var dc = Math.hypot(px.x - centerPx.x, px.y - centerPx.y);
        sc -= dc * 0.02;
      }
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    return best || land[0];
  }

  function scoreStart(t, map) {
    var s = 0;
    if (t.terrain === 'grassland' || t.terrain === 'plains') s += 4;
    if (t.terrain === 'desert' || t.terrain === 'snow' || t.terrain === 'tundra') s -= 3;
    if (MapGen.isFreshWater(t, map)) s += 5;
    if (MapGen.isCoastal(t, map)) s += 3;
    // 半径2 内潜在产出
    var ring = Units.ringAt(t.q, t.r, 1).concat(Units.ringAt(t.q, t.r, 2));
    for (var i = 0; i < ring.length; i++) {
      var nt = map.tiles[ring[i]];
      if (!nt || nt.water) continue;
      if (nt.hills) s += 1;
      if (nt.resource) s += 1;
    }
    return s;
  }

  function placeStartUnits(civId, tile) {
    Units.makeUnit('settler', civId, tile.q, tile.r);
    Units.makeUnit('warrior', civId, tile.q, tile.r);
    if (civId === 0) Units.makeUnit('builder', civId, tile.q, tile.r);
  }

  // ---- 点击处理 ----
  function onTileClick(q, r) {
    if (G.over) return;
    var key = Util.axialKey(q, r);
    var tile = G.map.tiles[key];
    if (!tile) return;
    var occ = Units.unitAt(q, r);
    var sel = G.sel;

    if (sel && sel.unit) {
      var u = sel.unit;
      if (u.hp <= 0 || G.units.indexOf(u) < 0) { clearSelection(); return; }
      if (isAttackTarget(sel.attacks, q, r)) { doAttack(q, r); return; }
      if (sel.reach[key] !== undefined) { moveSelectedTo(q, r); return; }
      if (occ && occ.civ === 0) { selectUnit(occ); return; }
      if (tile.cityId != null) { var c = G.cities[tile.cityId]; if (c && c.civ === 0) UI.openCity(c.id); else clearSelection(); return; }
      clearSelection();
      return;
    }
    // 无选中
    if (occ && occ.civ === 0) { selectUnit(occ); return; }
    if (tile.cityId != null) { var c2 = G.cities[tile.cityId]; if (c2 && c2.civ === 0) UI.openCity(c2.id); }
  }

  function isAttackTarget(arr, q, r) {
    for (var i = 0; i < arr.length; i++) if (arr[i].q === q && arr[i].r === r) return true;
    return false;
  }

  function selectUnit(u) {
    if (!u) { clearSelection(); return; }
    G.sel = {
      unit: u,
      reach: u.moves > 0 ? Units.reachable(u) : {},
      attacks: u.moves > 0 ? Units.attackTargets(u) : []
    };
    UI.showSide(); UI.showActions(u); Render.markDirty();
  }

  function clearSelection() {
    G.sel = null; UI.hideSide(); UI.hideActions(); Render.markDirty();
  }

  function moveSelectedTo(q, r) {
    var u = G.sel.unit;
    if (!u || u.moves <= 0) return;
    var path = Units.pathTo(u, q, r, 80);
    if (!path || !path.length) return;
    var remain = Units.walkPath(u, path);
    u.waitPath = remain.length ? remain : null;
    afterUnitAct();
  }

  function doAttack(q, r) {
    var u = G.sel.unit;
    if (!u) return;
    var tile = G.map.tiles[Util.axialKey(q, r)];
    var tu = Units.unitAt(q, r);
    var d = Units.def(u);
    var ranged = (d.kind === 'ranged' || d.kind === 'siege' || d.kind === 'naval_ranged');
    if (tu) {
      if (ranged || Util.hexDistance({ q: u.q, r: u.r }, { q: q, r: r }) > 1) Combat.rangedAttack(u, tu);
      else Combat.meleeAttack(u, tu);
    } else if (tile && tile.cityId != null) {
      var c = G.cities[tile.cityId];
      Combat.attackCity(u, c);
    }
    afterUnitAct();
  }

  function afterUnitAct() {
    if (G.sel && G.sel.unit) {
      var u = G.sel.unit;
      if (u.hp <= 0 || G.units.indexOf(u) < 0) { clearSelection(); refresh(); return; }
      G.sel.reach = u.moves > 0 ? Units.reachable(u) : {};
      G.sel.attacks = u.moves > 0 ? Units.attackTargets(u) : [];
      UI.showSide(); UI.showActions(u);
    }
    refresh();
  }

  function refresh() {
    Visibility.recomputeAll();
    UI.updateTopbar();
    Render.markDirty();
  }

  function notify(msg, type) { UI.notify(msg, type); }

  // ---- 回合结束 ----
  function endTurn() {
    if (G.over) return;
    var p = G.civs[0];
    if ((!p.research || !p.research.id)) {
      var a0 = Tech.availableTechs(p);
      if (a0.length) { Tech.setResearch(p, Tech.suggestNext(p)); }
    }

    G.turn++;

    // 1. AI 城市生产决策
    for (var i = 1; i < G.civs.length; i++) {
      var civ = G.civs[i];
      if (!civ || !civ.isAlive) continue;
      AI.aiCityPhase(civ);
    }
    // 2. 所有城市结算
    for (var c = 0; c < G.cities.length; c++) {
      if (G.cities[c]) Cities.update(G.cities[c]);
    }
    // 3. 科技与资源
    for (var i2 = 0; i2 < G.civs.length; i2++) {
      var cv = G.civs[i2];
      if (!cv) continue;
      Tech.researchTick(cv);
      if (cv.id >= 0) Cities.recountResources(cv);
    }
    // 4. AI 单位行动
    for (var i3 = 1; i3 < G.civs.length; i3++) {
      var civ3 = G.civs[i3];
      if (!civ3 || !civ3.isAlive) continue;
      Units.refreshMoves(civ3.id);
      AI.aiUnitPhase(civ3);
    }
    // 5. 蛮族
    Barbarians.turn();
    // 6. 可见性
    Visibility.recomputeAll();
    // 7. 玩家恢复移动力
    Units.refreshMoves(0);
    // 玩家自动续研
    var p2 = G.civs[0];
    if (!p2.research || !p2.research.id) {
      var a2 = Tech.availableTechs(p2);
      if (a2.length) { Tech.setResearch(p2, Tech.suggestNext(p2)); UI.notify('已开始研究：' + Data.TECH[p2.research.id].name, 'good'); }
    }
    // 8. 选中单位刷新
    if (G.sel && G.sel.unit) {
      var su = G.sel.unit;
      if (su.hp <= 0 || G.units.indexOf(su) < 0) clearSelection();
      else { G.sel.reach = su.moves > 0 ? Units.reachable(su) : {}; G.sel.attacks = su.moves > 0 ? Units.attackTargets(su) : []; }
    }
    checkVictory();
    refresh();
  }

  // ---- 胜负 ----
  function civAlive(id) {
    for (var i = 0; i < G.cities.length; i++) if (G.cities[i] && G.cities[i].civ === id) return true;
    for (var u = 0; u < G.units.length; u++) if (G.units[u].civ === id) return true;
    return false;
  }

  function recomputeAlive() {
    for (var i = 0; i < G.civs.length; i++) {
      var cv = G.civs[i];
      if (cv && cv.id >= 0) cv.isAlive = civAlive(cv.id);
    }
  }

  function checkVictory() {
    recomputeAlive();
    if (!civAlive(0)) { return endGame(false, '你的文明已被消灭……'); }
    if (Tech.scienceVictory(G.civs[0])) {
      return endGame(true, '🏆 科学胜利！你研发了全部科技，引领人类迈入新纪元。');
    }
    var aliveRivals = 0;
    for (var j = 1; j < G.civs.length; j++) if (G.civs[j] && civAlive(G.civs[j].id)) aliveRivals++;
    if (aliveRivals === 0) {
      return endGame(true, '🏆 统治胜利！你征服了所有对手文明，建立不朽霸业。');
    }
    if (G.turn > MAX_TURN) {
      var scores = {};
      for (var m = 0; m < G.civs.length; m++) { var cc = G.civs[m]; if (cc && cc.id >= 0) scores[cc.id] = civScore(cc); }
      var pScore = scores[0];
      var best = pScore, bestId = 0;
      for (var id in scores) if (scores[id] > best) { best = scores[id]; bestId = +id; }
      if (bestId === 0) endGame(true, '🏆 分数胜利！历经 ' + MAX_TURN + ' 回合，你的文明以 ' + pScore + ' 分傲视群雄。');
      else endGame(false, '时间结束，' + G.civs[bestId].name + ' 以 ' + best + ' 分获胜（你 ' + pScore + ' 分）。');
    }
  }

  function civScore(civ) {
    var s = 0;
    for (var i = 0; i < G.cities.length; i++) {
      var c = G.cities[i];
      if (!c || c.civ !== civ.id) continue;
      s += 20 + c.pop * 3;
    }
    s += (civ.researchedCount || 0) * 6;
    s += Math.floor((civ.gold || 0) / 20);
    return s;
  }

  function endGame(win, text) {
    G.over = true;
    UI.showEnd(win, text);
  }

  function centerOnSelection() {
    if (G.sel && G.sel.unit) Render.centerOn(G.sel.unit.q, G.sel.unit.r);
  }

  return {
    setupCanvas: setupCanvas, start: start, onTileClick: onTileClick, selectUnit: selectUnit,
    clearSelection: clearSelection, moveSelectedTo: moveSelectedTo, doAttack: doAttack,
    afterUnitAct: afterUnitAct, refresh: refresh, endTurn: endTurn, notify: notify,
    centerOfUnit: centerOnSelection, checkVictory: checkVictory
  };
})();

// ===== 入口 =====
(function () {
  function boot() {
    Game.setupCanvas();
    UI.init();
    Input.init();
    Render.start();
    document.getElementById('startBtn').onclick = function () {
      var opts = {
        civName: (document.getElementById('startCivName').value || '中华').slice(0, 6),
        leader: (document.getElementById('startLeader').value || '始皇').slice(0, 6),
        size: document.getElementById('startSize').value,
        enemies: document.getElementById('startEnemies').value,
        diff: document.getElementById('startDiff').value
      };
      Game.start(opts);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
