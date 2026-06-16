// UI 控制器：面板渲染、模态、点击/拖动/缩放
import { Game } from './game.js';
import { Renderer } from './render.js';
import { TERRAINS, RESOURCES, UNITS, BUILDINGS, TECHS, CIVICS, CIVS } from './data.js';
import { hexKey, pixelToHex, hexDistance, hexNeighbors } from './hex.js';

const $ = (id) => document.getElementById(id);

class UI {
  constructor() {
    this.game = null;
    this.renderer = null;
    this.selUnitId = null;
    this.selCityId = null;
    this.drag = null;       // { startX, startY, camX, camY }
    this.hasDragged = false;
  }

  start(options) {
    this.game = new Game(options || {});
    const canvas = $('map');
    this.renderer = new Renderer(canvas, this.game);
    // 视角中心：人类首位单位
    const human = this.game.humanCiv();
    const myUnit = this.game.units.find(u => u.civId === human.id);
    if (myUnit) this.renderer.centerOnHex(myUnit.q, myUnit.r);
    this.bindCanvas();
    this.bindButtons();
    this.refreshAll();
    this.loop();
  }

  loop() {
    this.renderer.draw();
    requestAnimationFrame(() => this.loop());
  }

  refreshAll() {
    this.refreshStats();
    this.refreshResearchPanel();
    this.refreshSelection();
    this.refreshNotifications();
    this.refreshCivList();
    this.refreshActionBar();
  }

  refreshStats() {
    const c = this.game.humanCiv();
    $('stat-turn').textContent = this.game.turn;
    $('stat-gold').textContent = Math.floor(c.gold);
    $('stat-gold-delta').textContent = `(${c.goldPerTurn >= 0 ? '+' : ''}${c.goldPerTurn})`;
    $('stat-science').textContent = c.sciencePerTurn;
    $('stat-culture').textContent = c.culturePerTurn;
    $('stat-faith').textContent = c.faithPerTurn;
    const cities = this.game.cities.filter(x => x.civId === c.id);
    $('stat-pop').textContent = cities.reduce((a, x) => a + x.pop, 0);
    $('stat-cities').textContent = cities.length;
  }

  refreshResearchPanel() {
    const c = this.game.humanCiv();
    const r = $('research-current');
    if (c.researching) {
      const T = TECHS[c.researching];
      const pct = Math.min(100, Math.floor(100 * c.science / T.cost));
      const turnsLeft = c.sciencePerTurn > 0 ? Math.ceil((T.cost - c.science) / c.sciencePerTurn) : '∞';
      r.innerHTML = `<b>${T.name}</b> <span style="color:#8c7d61">${c.science}/${T.cost} (${pct}%)</span><br><small>剩余 ${turnsLeft} 回合 · 解锁：${T.unlocks.join('、')}</small>`;
    } else {
      r.innerHTML = `<i>未选研究</i> <button id="btn-choose-tech-mini">选择</button>`;
      $('btn-choose-tech-mini').onclick = () => this.openTechTree();
    }
    const cv = $('civic-current');
    if (c.civicing) {
      const T = CIVICS[c.civicing];
      const pct = Math.min(100, Math.floor(100 * c.culture / T.cost));
      const turnsLeft = c.culturePerTurn > 0 ? Math.ceil((T.cost - c.culture) / c.culturePerTurn) : '∞';
      cv.innerHTML = `<b>${T.name}</b> <span style="color:#8c7d61">${c.culture}/${T.cost} (${pct}%)</span><br><small>剩余 ${turnsLeft} 回合</small>`;
    } else {
      cv.innerHTML = `<i>未选市政</i> <button id="btn-choose-civic-mini">选择</button>`;
      $('btn-choose-civic-mini').onclick = () => this.openCivicTree();
    }
  }

  refreshNotifications() {
    const ul = $('notif-list');
    ul.innerHTML = '';
    for (const n of this.game.notifications.slice(0, 12)) {
      const li = document.createElement('li');
      li.className = n.level;
      li.textContent = `T${n.turn}: ${n.msg}`;
      ul.appendChild(li);
    }
  }

  refreshCivList() {
    const ul = $('civ-list');
    ul.innerHTML = '';
    const sorted = [...this.game.civs].sort((a, b) => b.score - a.score);
    for (const c of sorted) {
      const li = document.createElement('li');
      if (c.isDead) li.className = 'civ-dead';
      const dot = `<span class="civ-color" style="background:${c.color}"></span>`;
      const known = c.id === this.game.humanCiv().id || this.game.humanCiv().knownCivs.has(c.id);
      const name = known ? `${c.name}·${c.leader}` : '???';
      const rel = c.id === this.game.humanCiv().id ? '' :
        (this.game.humanCiv().relations[c.id] === 'war' ? ' ⚔️' : ' 🕊️');
      li.innerHTML = `${dot}<span class="civ-name">${name}${rel}</span><span class="civ-score">${c.score}</span>`;
      ul.appendChild(li);
    }
  }

  refreshSelection() {
    const wrap = $('sel-content');
    if (this.selUnitId) {
      const u = this.game.units.find(x => x.id === this.selUnitId);
      if (!u) { this.selUnitId = null; this.renderer.selected = null; this.renderer.movePreview = null; this.renderer.attackPreview = null; wrap.innerHTML = '点击地图上的单位或城市'; return; }
      const U = UNITS[u.type];
      const civ = this.game.civById(u.civId);
      let html = `<h4>${U.icon} ${U.name}</h4>
        <div class="row"><span>所属</span><b>${civ.name}</b></div>
        <div class="row"><span>位置</span><b>(${u.q}, ${u.r})</b></div>
        <div class="row"><span>行动力</span><b>${u.movesLeft}/${u.maxMoves}</b></div>`;
      if (U.hp > 0) {
        html += `<div class="row"><span>生命</span><b>${u.hp}/${U.hp}</b></div>
                 <div class="hp-bar"><div style="width:${100*u.hp/U.hp}%"></div></div>`;
        html += `<div class="row"><span>战力</span><b>${U.atk}/${U.def}</b></div>`;
      }
      if (u.buildingImpr) html += `<div class="row"><span>建造中</span><b>${u.buildingImpr.type} 还剩 ${u.buildingImpr.turnsLeft} 回合</b></div>`;
      if (U.charges) html += `<div class="row"><span>剩余次数</span><b>${u.charges}</b></div>`;
      wrap.innerHTML = html;
      this.renderer.selected = { type: 'unit', id: u.id };
      if (u.civId === this.game.humanCiv().id) {
        const reach = this.game.reachableTiles(u);
        this.renderer.movePreview = new Set(reach.keys());
        this.renderer.attackPreview = this.game.attackableTiles(u);
      } else {
        this.renderer.movePreview = null;
        this.renderer.attackPreview = null;
      }
    } else if (this.selCityId) {
      const c = this.game.cities.find(x => x.id === this.selCityId);
      if (!c) { this.selCityId = null; this.renderer.selected = null; wrap.innerHTML = '点击地图上的单位或城市'; return; }
      const civ = this.game.civById(c.civId);
      const y = this.game.cityYields(c);
      const net = this.game.cityNetFood(c);
      let html = `<h4>🏙️ ${c.name}</h4>
        <div class="row"><span>所属</span><b>${civ.name}</b></div>
        <div class="row"><span>人口</span><b>${c.pop}</b></div>
        <div class="row"><span>生命</span><b>${c.hp}/${c.maxHp}</b></div>
        <div class="hp-bar"><div style="width:${100*c.hp/c.maxHp}%; background:linear-gradient(90deg,#e87a7a,#aa3a3a)"></div></div>
        <div class="row"><span>食物/产能</span><b>${y.food}(${net>=0?'+':''}${net}) / ${y.prod}</b></div>
        <div class="row"><span>科/文/金</span><b>${y.sci} / ${y.cult} / ${y.gold}</b></div>
        <div class="row"><span>食物进度</span><b>${Math.floor(c.food)}/${c.foodNext}</b></div>`;
      if (c.production) {
        const item = c.production;
        const needed = item.kind === 'unit' ? UNITS[item.id].cost : BUILDINGS[item.id].cost;
        const name = item.kind === 'unit' ? UNITS[item.id].name : BUILDINGS[item.id].name;
        const turnsLeft = y.prod > 0 ? Math.ceil((needed - item.prog) / y.prod) : '∞';
        html += `<h4>生产中</h4><div class="queue-item"><span>${name}</span><span>${item.prog}/${needed} · ${turnsLeft}回合</span></div>`;
      } else html += `<h4>生产中</h4><i>无</i>`;
      html += `<h4>建筑</h4>`;
      const builts = [...c.buildings].filter(b => BUILDINGS[b]).map(b => BUILDINGS[b].name).join('、') || '无';
      html += `<div>${builts}</div>`;
      if (c.civId === this.game.humanCiv().id) {
        html += `<button id="btn-city-prod">生产 / 队列</button>`;
      }
      wrap.innerHTML = html;
      if (c.civId === this.game.humanCiv().id) {
        $('btn-city-prod').onclick = () => this.openCityProductionModal(c);
      }
      this.renderer.selected = { type: 'city', id: c.id };
      this.renderer.movePreview = null;
      this.renderer.attackPreview = null;
    } else {
      wrap.innerHTML = '点击地图上的单位或城市';
      this.renderer.selected = null;
      this.renderer.movePreview = null;
      this.renderer.attackPreview = null;
    }
  }

  refreshActionBar() {
    const bar = $('action-buttons');
    bar.innerHTML = '';
    if (!this.selUnitId) return;
    const u = this.game.units.find(x => x.id === this.selUnitId);
    if (!u || u.civId !== this.game.humanCiv().id) return;
    const U = UNITS[u.type];

    const addBtn = (txt, fn, disabled = false) => {
      const b = document.createElement('button');
      b.textContent = txt;
      if (disabled) b.disabled = true;
      else b.onclick = fn;
      bar.appendChild(b);
    };

    if (u.type === 'settler') {
      addBtn('🏛️ 建立城市', () => {
        if (this.game.foundCity(u)) { this.selUnitId = null; this.refreshAll(); }
      });
    }
    if (u.type === 'worker') {
      const opts = this.game.workerOptionsAt(u);
      if (opts.length) {
        for (const o of opts) addBtn(`⚒️ ${o.name}`, () => {
          u.buildingImpr = { type: o.type, turnsLeft: 3 };
          u.movesLeft = 0;
          this.refreshAll();
        });
      } else addBtn('⚒️ 改良 (无可建)', null, true);
    }
    if (U.type === 'military') {
      addBtn(u.fortified > 0 ? '🛡️ 取消加固' : '🛡️ 加固', () => {
        u.fortified = u.fortified > 0 ? 0 : 1; u.movesLeft = 0;
        this.refreshAll();
      });
    }
    addBtn('💤 跳过', () => { u.movesLeft = 0; this.refreshAll(); });
    addBtn('❌ 解散', () => { this.game.removeUnit(u); this.selUnitId = null; this.refreshAll(); });
  }

  // ---- 鼠标 ----
  bindCanvas() {
    const cv = this.renderer.canvas;
    cv.addEventListener('mousedown', (e) => {
      this.drag = { startX: e.clientX, startY: e.clientY, camX: this.renderer.camera.x, camY: this.renderer.camera.y };
      this.hasDragged = false;
      cv.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.startX;
      const dy = e.clientY - this.drag.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.hasDragged = true;
      this.renderer.camera.x = this.drag.camX - dx / this.renderer.camera.zoom;
      this.renderer.camera.y = this.drag.camY - dy / this.renderer.camera.zoom;
    });
    window.addEventListener('mouseup', (e) => {
      if (this.drag) {
        cv.classList.remove('dragging');
        const wasDrag = this.hasDragged;
        this.drag = null;
        if (!wasDrag) this.handleClick(e);
      }
    });
    cv.addEventListener('mousemove', (e) => {
      const rect = cv.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const w = this.renderer.screenToWorld(sx, sy);
      const h = pixelToHex(w.x, w.y, this.renderer.hexSize);
      this.renderer.hoverHex = h;
      this.updateTooltip(h, e.clientX, e.clientY);
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const z = this.renderer.camera.zoom;
      const dir = e.deltaY > 0 ? -1 : 1;
      const nz = Math.max(0.4, Math.min(2.5, z + dir * 0.15));
      this.renderer.camera.zoom = nz;
    }, { passive: false });
  }

  updateTooltip(hex, sx, sy) {
    const tip = $('tooltip');
    const t = this.game.map.tiles.get(hexKey(hex.q, hex.r));
    const human = this.game.humanCiv();
    if (!t || !human.exploredTiles.has(hexKey(hex.q, hex.r))) {
      tip.classList.add('hidden'); return;
    }
    const T = TERRAINS[t.terrain];
    let html = `<b>${T.name}</b> (${t.q},${t.r})<br>`;
    if (t.resource) html += `${RESOURCES[t.resource].icon} ${RESOURCES[t.resource].name}<br>`;
    if (t.improvement) html += `⚙ ${t.improvement.name}<br>`;
    if (t.owner) {
      const civ = this.game.civById(t.owner);
      if (civ) html += `<span style="color:${civ.color}">▲</span> ${civ.name}<br>`;
    }
    const u = this.game.unitAt(hex.q, hex.r);
    if (u && this.game.visibleTilesFor(human).has(hexKey(hex.q, hex.r))) {
      const civ = this.game.civById(u.civId);
      html += `${UNITS[u.type].icon} ${UNITS[u.type].name} (${civ.name})<br>`;
    }
    const c = this.game.cityAt(hex.q, hex.r);
    if (c) {
      const civ = this.game.civById(c.civId);
      html += `🏙️ ${c.name} pop ${c.pop} (${civ.name})<br>`;
    }
    tip.innerHTML = html;
    tip.style.left = (sx + 14) + 'px';
    tip.style.top = (sy + 14) + 'px';
    tip.classList.remove('hidden');
  }

  handleClick(e) {
    const rect = this.renderer.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = this.renderer.screenToWorld(sx, sy);
    const h = pixelToHex(w.x, w.y, this.renderer.hexSize);
    const human = this.game.humanCiv();

    // 若选中是我方军事单位 & 该格在攻击范围 → 攻击
    if (this.selUnitId) {
      const u = this.game.units.find(x => x.id === this.selUnitId);
      if (u && u.civId === human.id) {
        const atkKey = hexKey(h.q, h.r);
        const atk = this.game.attackableTiles(u);
        if (atk.has(atkKey)) {
          this.game.attack(u, h.q, h.r);
          this.refreshAll();
          return;
        }
        const reach = this.game.reachableTiles(u);
        if (reach.has(atkKey)) {
          this.game.moveUnit(u, h.q, h.r);
          this.refreshAll();
          return;
        }
      }
    }

    // 选中目标
    const u = this.game.unitAt(h.q, h.r);
    const c = this.game.cityAt(h.q, h.r);
    if (u && this.game.visibleTilesFor(human).has(hexKey(h.q, h.r))) {
      this.selUnitId = u.id; this.selCityId = null;
    } else if (c && human.exploredTiles.has(hexKey(h.q, h.r))) {
      this.selCityId = c.id; this.selUnitId = null;
    } else {
      this.selUnitId = null; this.selCityId = null;
    }
    this.refreshAll();
  }

  // ---- 按钮 ----
  bindButtons() {
    $('btn-end-turn').onclick = () => {
      if (this.game.gameOver) { this.openGameOverModal(); return; }
      this.game.endTurn();
      this.refreshAll();
      if (this.game.gameOver) this.openGameOverModal();
    };
    $('btn-tech').onclick = () => this.openTechTree();
    $('btn-civic').onclick = () => this.openCivicTree();
    $('btn-diplo').onclick = () => this.openDiplomacy();
    $('btn-save').onclick = () => this.save();
    $('btn-load').onclick = () => this.load();
    $('btn-new').onclick = () => this.openNewGameModal();
    $('btn-help').onclick = () => this.openHelp();
    $('modal-close').onclick = () => this.closeModal();
  }

  save() {
    try {
      const data = this.game.serialize();
      localStorage.setItem('civ6_save', JSON.stringify(data));
      this.game.notify('已保存到本地存档', 'good');
      this.refreshAll();
    } catch (e) {
      alert('保存失败：' + e.message);
    }
  }
  load() {
    try {
      const raw = localStorage.getItem('civ6_save');
      if (!raw) { alert('没有可用存档'); return; }
      const data = JSON.parse(raw);
      this.game = Game.deserialize(data);
      this.renderer.game = this.game;
      this.selUnitId = null; this.selCityId = null;
      this.refreshAll();
      this.game.notify('已读取存档', 'good');
      this.refreshAll();
    } catch (e) {
      alert('读取失败：' + e.message);
    }
  }

  // ---- 模态 ----
  openModal(title, html) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal-root').classList.remove('hidden');
  }
  closeModal() { $('modal-root').classList.add('hidden'); }

  openTechTree() {
    const c = this.game.humanCiv();
    const tids = Object.keys(TECHS);
    let html = '<div class="tree-grid">';
    for (const id of tids) {
      const T = TECHS[id];
      const researched = c.researched.has(id);
      const current = c.researching === id;
      const locked = !T.prereq.every(p => c.researched.has(p));
      let cls = 'tree-node';
      if (researched) cls += ' researched';
      if (current) cls += ' current';
      if (locked && !researched && !current) cls += ' locked';
      html += `<div class="${cls}" data-tech="${id}">
        <div class="tn-name">${T.name} <small style="color:#8c7d61">[${T.era}]</small></div>
        <div class="tn-cost">${T.cost}🔬${researched ? ' · ✓已研究' : current ? ' · ★研究中' : ''}</div>
        <div class="tn-unlocks">需要: ${T.prereq.map(p=>TECHS[p]?.name||p).join('、')||'-'}<br>解锁: ${T.unlocks.join('、')}</div>
      </div>`;
    }
    html += '</div>';
    this.openModal('科技树', html);
    $('modal-body').querySelectorAll('.tree-node').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.tech;
        const T = TECHS[id];
        if (c.researched.has(id)) return;
        if (!T.prereq.every(p => c.researched.has(p))) { alert('前置未满足'); return; }
        c.researching = id;
        this.closeModal();
        this.refreshAll();
      };
    });
  }
  openCivicTree() {
    const c = this.game.humanCiv();
    const tids = Object.keys(CIVICS);
    let html = '<div class="tree-grid">';
    for (const id of tids) {
      const T = CIVICS[id];
      const researched = c.civicked.has(id);
      const current = c.civicing === id;
      const locked = !T.prereq.every(p => c.civicked.has(p));
      let cls = 'tree-node';
      if (researched) cls += ' researched';
      if (current) cls += ' current';
      if (locked && !researched && !current) cls += ' locked';
      const grants = Object.entries(T.grants||{}).map(([k,v]) => `${k}:${v}`).join('、');
      html += `<div class="${cls}" data-civic="${id}">
        <div class="tn-name">${T.name}</div>
        <div class="tn-cost">${T.cost}🎭${researched ? ' · ✓已完成' : current ? ' · ★进行中' : ''}</div>
        <div class="tn-unlocks">需要: ${T.prereq.map(p=>CIVICS[p]?.name||p).join('、')||'-'}<br>加成: ${grants||'-'}</div>
      </div>`;
    }
    html += '</div>';
    this.openModal('市政树（文化）', html);
    $('modal-body').querySelectorAll('.tree-node').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.civic;
        const T = CIVICS[id];
        if (c.civicked.has(id)) return;
        if (!T.prereq.every(p => c.civicked.has(p))) { alert('前置未满足'); return; }
        c.civicing = id;
        this.closeModal();
        this.refreshAll();
      };
    });
  }
  openDiplomacy() {
    const me = this.game.humanCiv();
    let html = '';
    if (!me.knownCivs.size) html = '<i>尚未接触其他文明</i>';
    for (const id of me.knownCivs) {
      const c = this.game.civById(id);
      if (!c || c.isDead) continue;
      const rel = me.relations[id];
      html += `<div class="diplo-civ">
        <h3 style="color:${c.color}">${c.name} · ${c.leader}</h3>
        <div>关系：<b>${rel === 'war' ? '⚔️ 战争' : '🕊️ 和平'}</b></div>
        <div>分数：${c.score} · 城市：${this.game.cities.filter(x=>x.civId===id).length}</div>
        <div class="diplo-actions">
          ${rel === 'peace'
            ? `<button data-act="war" data-id="${id}">宣战</button>`
            : `<button data-act="peace" data-id="${id}">缔结和平</button>`}
        </div>
      </div>`;
    }
    this.openModal('外交', html);
    $('modal-body').querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        const target = this.game.civById(id);
        if (b.dataset.act === 'war') this.game.declareWar(me, target);
        else this.game.makePeace(me, target);
        this.closeModal();
        this.refreshAll();
      };
    });
  }
  openCityProductionModal(city) {
    const civ = this.game.civById(city.civId);
    let html = '<h3>选择生产</h3><div class="tree-grid">';
    const unitOpts = this.game.availableUnitsFor(civ);
    for (const id of unitOpts) {
      const U = UNITS[id];
      html += `<div class="tree-node" data-kind="unit" data-id="${id}">
        <div class="tn-name">${U.icon} ${U.name}</div>
        <div class="tn-cost">${U.cost}⚒</div>
        <div class="tn-unlocks">${U.type === 'military' ? `战力 ${U.atk}/${U.def}` : '平民'}${U.ranged ? ' · 远程' : ''}</div>
      </div>`;
    }
    const bopts = Object.keys(BUILDINGS).filter(b => {
      const B = BUILDINGS[b];
      if (city.buildings.has(b)) return false;
      if (B.tech && !civ.researched.has(B.tech)) return false;
      return true;
    });
    for (const id of bopts) {
      const B = BUILDINGS[id];
      html += `<div class="tree-node" data-kind="building" data-id="${id}">
        <div class="tn-name">🏛 ${B.name}</div>
        <div class="tn-cost">${B.cost}⚒</div>
        <div class="tn-unlocks">${Object.entries(B.yield||{}).map(([k,v])=>`${k}+${v}`).join('、')||''}${B.defense?` · 防御+${B.defense}`:''}</div>
      </div>`;
    }
    html += '</div>';
    this.openModal(`${city.name} 生产`, html);
    $('modal-body').querySelectorAll('.tree-node').forEach(el => {
      el.onclick = () => {
        city.production = { kind: el.dataset.kind, id: el.dataset.id, prog: 0 };
        this.closeModal();
        this.refreshAll();
      };
    });
  }
  openNewGameModal() {
    const html = `<p>选择你的文明：</p>
      <div class="tree-grid">
        ${CIVS.map(c => `<div class="tree-node" data-civ="${c.id}">
          <div class="tn-name" style="color:${c.color}">${c.name}</div>
          <div class="tn-unlocks">领袖：${c.leader}<br>风格：${c.bias}</div>
        </div>`).join('')}
      </div>
      <p style="margin-top:12px">
        地图大小：<select id="opt-map"><option value="14">小</option><option value="18" selected>中</option><option value="24">大</option></select>
        &nbsp;敌方数量：<select id="opt-civs"><option value="3">3</option><option value="4">4</option><option value="5" selected>5</option><option value="7">7</option></select>
        &nbsp;<button id="btn-go" disabled>开始</button>
      </p>`;
    this.openModal('新游戏', html);
    let pick = null;
    $('modal-body').querySelectorAll('[data-civ]').forEach(el => {
      el.onclick = () => {
        pick = el.dataset.civ;
        $('modal-body').querySelectorAll('[data-civ]').forEach(e2 => e2.classList.remove('current'));
        el.classList.add('current');
        $('btn-go').disabled = false;
      };
    });
    $('btn-go').onclick = () => {
      const mapRadius = parseInt($('opt-map').value);
      const numCivs = parseInt($('opt-civs').value);
      this.closeModal();
      this.start({ seed: (Math.random() * 1e9) | 0, mapRadius, numCivs, humanCivId: pick });
    };
  }
  openHelp() {
    this.openModal('帮助', `
      <div class="help-section"><h3>目标</h3><p>带领你的文明走向胜利。四种胜利条件：科技（研究太空飞行）、文化（完成全球化）、征服（消灭所有对手）、分数（1500 分或第 300 回合最高分）。</p></div>
      <div class="help-section"><h3>操作</h3><ul>
        <li>左键点击单位 / 城市选中</li>
        <li>点击绿色高亮格移动单位；红色高亮格攻击</li>
        <li>拖动地图平移、滚轮缩放</li>
        <li>右上角"结束回合"推进游戏；AI 会同回合行动</li>
      </ul></div>
      <div class="help-section"><h3>核心循环</h3><ul>
        <li>用开拓者建立城市，工人建造改良提升产出</li>
        <li>城市每回合产出食物（人口）、产能（生产单位/建筑）、科技、文化、金币</li>
        <li>科技解锁新单位/建筑，市政解锁加成</li>
        <li>军事单位用近战或远程压制对手</li>
      </ul></div>
      <div class="help-section"><h3>战斗</h3><p>胜负由攻防比决定。地形（丘陵/森林/雨林）和加固/城墙提供加成。远程不受反击。城墙血量耗尽且攻击者是近战单位才能占领城市。</p></div>
    `);
  }
  openGameOverModal() {
    const winner = this.game.civById(this.game.gameOver.winner);
    const types = { science: '科技', culture: '文化', domination: '征服', score: '分数', time: '时代终结' };
    const me = this.game.humanCiv();
    const text = winner.id === me.id ? '你赢了！🏆' : `你输了，${winner.name} 取得${types[this.game.gameOver.type]}胜利`;
    let board = '<h3>最终排名</h3><ol>';
    for (const c of [...this.game.civs].sort((a, b) => b.score - a.score)) {
      board += `<li style="color:${c.color}">${c.name}·${c.leader} — ${c.score} 分${c.isDead?' (灭亡)':''}</li>`;
    }
    board += '</ol>';
    this.openModal('游戏结束', `<h2>${text}</h2>${board}<button onclick="location.reload()">再来一局</button>`);
  }
}

const ui = new UI();
// 自动开局
ui.start({ humanCivId: 'china', mapRadius: 18, numCivs: 5 });
window.__ui = ui;
