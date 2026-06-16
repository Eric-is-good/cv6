// ===== 用户界面：顶部栏、侧栏、动作栏、城市/科技面板、通知 =====
var UI = (function () {
  'use strict';

  var el = {};
  var notifId = 0;

  function init() {
    el.yields = document.getElementById('yields');
    el.civName = document.getElementById('civName');
    el.civSub = document.getElementById('civSub');
    el.civFlag = document.getElementById('civFlag');
    el.rBox = document.getElementById('researchBox');
    el.rName = document.getElementById('rName');
    el.rFill = document.getElementById('rFill');
    el.rText = document.getElementById('rText');
    el.side = document.getElementById('sidepanel');
    el.action = document.getElementById('actionbar');
    el.notif = document.getElementById('notifications');
    el.cityModal = document.getElementById('cityModal');
    el.cityBody = document.getElementById('cityBody');
    el.cityTitle = document.getElementById('cityTitle');
    el.techModal = document.getElementById('techModal');
    el.techBody = document.getElementById('techBody');
    el.helpModal = document.getElementById('helpModal');
    el.helpBody = document.getElementById('helpBody');
    el.logModal = document.getElementById('logModal');
    el.logBody = document.getElementById('logBody');
    el.endTitle = document.getElementById('endTitle');
    el.endText = document.getElementById('endText');
    el.endModal = document.getElementById('endModal');

    document.getElementById('btnTech').onclick = openTech;
    document.getElementById('btnLog').onclick = function () { openLog(); };
    document.getElementById('btnHelp').onclick = function () { el.helpModal.classList.remove('hidden'); };
    document.getElementById('btnEndTurn').onclick = function () { Game.endTurn(); };
    el.rBox.onclick = openTech;
    document.getElementById('cityClose').onclick = function () { el.cityModal.classList.add('hidden'); };
    document.getElementById('techClose').onclick = function () { el.techModal.classList.add('hidden'); };
    document.getElementById('helpClose').onclick = function () { el.helpModal.classList.add('hidden'); };
    document.getElementById('logClose').onclick = function () { el.logModal.classList.add('hidden'); };
    document.getElementById('endBtn').onclick = function () { location.reload(); };
    fillHelp();
  }

  // ---- 顶部栏 ----
  function updateTopbar() {
    var civ = G.civs[0];
    el.civName.textContent = civ.name + ' · ' + civ.leader;
    el.civFlag.textContent = civ.name.charAt(0);
    el.civSub.textContent = '第 ' + G.turn + ' 回合 · ' + (Data.ERA_NAME[currentEra(civ)] || '古代');
    var stats = civStats(civ);
    el.yields.innerHTML =
      y('y-s', '🔬', stats.science) +
      y('y-c', '🎭', stats.culture) +
      y('y-g', '💰', stats.gold + (stats.gold >= 0 ? '/回合' : '/回合')) +
      y('y-h', '🏙', stats.cities) +
      y('y-f', '👥', stats.pop);
    // 研究框
    var info = Tech.researchInfo(civ);
    if (info) {
      el.rName.textContent = info.name;
      var pct = Math.min(100, info.progress / info.cost * 100);
      el.rFill.style.width = pct + '%';
      el.rText.textContent = Math.floor(info.progress) + ' / ' + info.cost + ' 科技';
    } else {
      el.rName.textContent = '（点击选择研究）';
      el.rFill.style.width = '0%';
      el.rText.textContent = '尚无研究项目';
    }
  }

  function currentEra(civ) {
    var era = 'ancient';
    for (var id in civ.techs) {
      var e = Data.TECH[id].era;
      if (eraOrder(e) > eraOrder(era)) era = e;
    }
    return era;
  }
  function eraOrder(e) { return { ancient: 0, classical: 1, medieval: 2, renaissance: 3, industrial: 4 }[e] || 0; }

  function y(cls, ic, val) { return '<span class="yield ' + cls + '"><span class="ic">' + ic + '</span>' + val + '</span>'; }

  function civStats(civ) {
    var s = { science: 0, gold: 0, culture: 0, food: 0, prod: 0, pop: 0, cities: 0 };
    var maint = 0;
    for (var i = 0; i < G.units.length; i++) {
      if (G.units[i].civ === civ.id) maint += Data.UNIT[G.units[i].type].maint || 0;
    }
    for (var c = 0; c < G.cities.length; c++) {
      var city = G.cities[c];
      if (!city || city.civ !== civ.id) continue;
      Cities.computeYields(city);
      var yy = city.yields;
      s.science += yy[3]; s.gold += yy[2]; s.culture += yy[4];
      s.food += yy[0]; s.prod += yy[1]; s.pop += city.pop; s.cities++;
    }
    s.gold = Math.round(s.gold - maint);
    s.science = Math.round(s.science);
    s.culture = Math.round(s.culture);
    return s;
  }

  // ---- 侧栏：选中单位/城市信息 ----
  function showSide() {
    if (!G.sel || !G.sel.unit) { el.side.classList.add('hidden'); return; }
    var u = G.sel.unit;
    var d = Units.def(u);
    var html = '<h3>' + d.name + '</h3>';
    html += '<div class="row"><span>生命</span><b>' + u.hp + '/100</b></div>';
    html += '<div class="row"><span>移动力</span><b>' + u.moves + '/' + d.moves + '</b></div>';
    if (d.str) html += '<div class="row"><span>战斗力</span><b>' + d.str + (d.range ? ' (射' + d.range + ')' : '') + '</b></div>';
    if (d.kind === 'builder') html += '<div class="row"><span>建造次数</span><b>' + u.charges + '</b></div>';
    if (u.fortified) html += '<div class="row muted"><span>已驻防</span></div>';
    el.side.innerHTML = html;
    el.side.classList.remove('hidden');
  }

  function hideSide() { el.side.classList.add('hidden'); }

  // ---- 动作栏 ----
  function showActions(u) {
    el.action.innerHTML = '';
    if (!u) { el.action.classList.add('hidden'); return; }
    var d = Units.def(u);
    var btns = [];
    btns.push(abtn('跳过', function () { u.moves = 0; Game.afterUnitAct(); }));
    if (d.kind === 'settler') {
      var tile = G.map.tiles[Util.axialKey(u.q, u.r)];
      var ok = tile && !tile.water && tile.terrain !== 'mountain' && tile.cityId == null &&
        !tooCloseToCity(u.q, u.r);
      btns.push(abtn(ok ? '建立城市' : '无法建城', function () {
        if (ok) { Cities.foundCity(u); Game.clearSelection(); Game.refresh(); }
      }, !ok));
    }
    if (d.kind === 'builder') {
      var t2 = G.map.tiles[Util.axialKey(u.q, u.r)];
      var imps = validImprovements(t2, G.civs[0]);
      for (var i = 0; i < imps.length; i++) {
        (function (ik) {
          btns.push(abtn(Data.IMPROVE[ik].name, function () {
            t2.improvement = ik; u.charges--; Game.notify('建造了' + Data.IMPROVE[ik].name, 'good');
            if (u.charges <= 0) { Units.killUnit(u); }
            u.moves = 0; Game.afterUnitAct();
          }));
        })(imps[i]);
      }
      if (!imps.length) btns.push(abtn('无可改良', null, true));
    }
    if (Units.isMilitary(u) || Units.isNaval(u)) {
      btns.push(abtn(u.fortified ? '取消驻防' : '驻防', function () {
        u.fortified = !u.fortified; u.moves = 0; Game.afterUnitAct();
      }));
      btns.push(abtn('解散', function () {
        if (confirm('解散该单位？')) { Units.killUnit(u); Game.clearSelection(); Game.refresh(); }
      }));
    }
    for (var b = 0; b < btns.length; b++) el.action.appendChild(btns[b]);
    el.action.classList.remove('hidden');
  }
  function hideActions() { el.action.classList.add('hidden'); }

  function abtn(label, fn, disabled) {
    var b = document.createElement('button');
    b.className = 'btn'; b.textContent = label;
    if (disabled) { b.disabled = true; }
    else if (fn) b.onclick = fn;
    return b;
  }

  function validImprovements(t, civ) {
    if (!t || t.water || t.cityId != null) return [];
    if (t.improvement) return [];
    var out = [];
    for (var ik in Data.IMPROVE) {
      var imp = Data.IMPROVE[ik];
      if (civ.techs[imp.tech] && imp.valid(t)) out.push(ik);
    }
    return out;
  }

  function tooCloseToCity(q, r) {
    for (var i = 0; i < G.cities.length; i++) {
      if (!G.cities[i]) continue;
      if (Util.hexDistance({ q: q, r: r }, { q: G.cities[i].q, r: G.cities[i].r }) < 3) return true;
    }
    return false;
  }

  // ---- 城市面板 ----
  function openCity(cityId) {
    var city = G.cities[cityId];
    if (!city || city.civ !== 0) return;
    el.cityTitle.textContent = city.name + (city.capital ? ' ★首都' : '');
    Cities.computeYields(city);
    var yy = city.yields;
    var need = Cities.growthNeed(city.pop);
    var consume = 2 * city.pop;
    var netFood = yy[0] - consume;
    var house = Cities.housing(city);
    var item = city.buildQueue[0];
    var itemCost = item ? Cities.itemCost(item) : 0;

    var html = '<div class="city-grid">';
    html += '<div class="city-stats">';
    html += '<h3>城市概况</h3>';
    html += row('人口', city.pop + (city.pop >= house ? ' (住房不足)' : ' / 住房 ' + house));
    html += barRow('食物', city.food, need, 'food', (netFood >= 0 ? '+' : '') + netFood + '/回合');
    html += barRow('产能', city.prod, itemCost, 'prod', '+' + yy[1] + '/回合');
    html += row('科技', '+' + yy[3] + '/回合');
    html += row('金币', '+' + yy[2] + '/回合');
    html += row('文化', '+' + yy[4] + '/回合');
    html += row('当前建造', item ? itemName(item) : '（无）');
    html += '<div class="building-list"><b>已有建筑：</b> ';
    var bs = [];
    for (var bk in city.buildings) bs.push(Data.BUILDING[bk] ? Data.BUILDING[bk].name : bk);
    html += (bs.join('、') || '无') + '</div>';
    html += '<div class="building-list"><b>驻军：</b> ' + (garrisonName(city)) + '</div>';
    html += '</div>';

    html += '<div><h3>生产队列</h3><div class="prod-list" id="prodList"></div></div>';
    html += '</div>';
    el.cityBody.innerHTML = html;
    el.cityModal.classList.remove('hidden');

    var list = document.getElementById('prodList');
    var opts = Cities.buildOptions(city);
    // 当前
    if (item) {
      var cur = document.createElement('div');
      cur.className = 'prod-item current';
      cur.innerHTML = '<span>▶ ' + itemName(item) + '</span><span class="cost">' +
        Math.floor(city.prod) + '/' + itemCost + '</span>';
      list.appendChild(cur);
    }
    for (var i = 0; i < opts.length; i++) {
      (function (o) {
        var div = document.createElement('div');
        div.className = 'prod-item';
        var buyCost = o.cost * 4 + 20;
        div.innerHTML = '<span>' + (o.glyph ? o.glyph + ' ' : '') + o.name + '</span>' +
          '<span class="cost">' + o.cost + '⚡ / ' + buyCost + '💰</span>';
        div.onclick = function () {
          city.buildQueue = [Util.clone(o)];
          openCity(cityId);
          Render.markDirty();
        };
        // 右键/双击购买
        var buy = document.createElement('button');
        buy.className = 'btn'; buy.style.marginLeft = '6px'; buy.textContent = '金币购买';
        buy.onclick = function (ev) { ev.stopPropagation(); Cities.buyItem(city, Util.clone(o)); openCity(cityId); Render.markDirty(); };
        div.appendChild(buy);
        list.appendChild(div);
      })(opts[i]);
    }
    UI._openCityId = cityId;
  }
  function garrisonName(city) {
    if (city.garrison == null) return '无';
    var u = G.units.find(function (x) { return x.id === city.garrison; });
    return u ? Data.UNIT[u.type].name : '无';
  }
  function itemName(item) {
    if (item.kind === 'unit') return Data.UNIT[item.key].name;
    return Data.BUILDING[item.key].name;
  }
  function row(a, b) { return '<div class="row"><span>' + a + '</span><b>' + b + '</b></div>'; }
  function barRow(a, cur, max, cls, sub) {
    var pct = max > 0 ? Math.min(100, cur / max * 100) : 0;
    return '<div class="city-progress"><div class="bar-label">' + a + '：' + Math.floor(cur) + '/' + max + ' <span class="muted">(' + sub + ')</span></div>' +
      '<div class="bar"><div class="' + cls + '" style="width:' + pct + '%"></div></div></div>';
  }

  // ---- 科技面板 ----
  function openTech() {
    var civ = G.civs[0];
    var byEra = {};
    for (var id in Data.TECH) {
      var e = Data.TECH[id].era;
      if (!byEra[e]) byEra[e] = [];
      byEra[e].push(id);
    }
    var order = ['ancient', 'classical', 'medieval', 'renaissance', 'industrial'];
    var html = '<div class="tech-body-wrap">';
    for (var i = 0; i < order.length; i++) {
      if (!byEra[order[i]]) continue;
      html += '<div class="tech-era">' + Data.ERA_NAME[order[i]] + '</div>';
      for (var j = 0; j < byEra[order[i]].length; j++) {
        var tid = byEra[order[i]][j];
        var tech = Data.TECH[tid];
        var cls = 'tech-node ';
        var status = '';
        if (civ.techs[tid]) { cls += 'done'; status = '✓ 已研发'; }
        else if (civ.research && civ.research.id === tid) { cls += 'current'; status = '研究中 ' + Math.floor(civ.research.progress) + '/' + tech.cost; }
        else if (Tech.reqsMet(civ, tid)) { cls += 'available'; status = '可研究'; }
        else cls += 'locked';
        var unlocks = tech.unlocks.join('、') || '—';
        html += '<div class="' + cls + '" data-id="' + tid + '">';
        html += '<div class="t-name">' + tech.name + '</div>';
        html += '<div class="t-cost">' + tech.cost + ' 科技</div>';
        html += '<div style="font-size:11px;color:#8a99ac;margin-top:4px">解锁：' + unlocks + '</div>';
        html += '<div style="font-size:11px;margin-top:2px">' + status + '</div>';
        html += '</div>';
      }
      html += '<div style="clear:both"></div>';
    }
    html += '</div>';
    el.techBody.innerHTML = html;
    var nodes = el.techBody.querySelectorAll('.tech-node');
    for (var n = 0; n < nodes.length; n++) {
      nodes[n].onclick = function () {
        var id = this.getAttribute('data-id');
        if (Tech.reqsMet(civ, id) && !civ.techs[id]) {
          Tech.setResearch(civ, id);
          Game.notify('开始研究：' + Data.TECH[id].name, 'good');
          updateTopbar(); Render.markDirty();
          el.techModal.classList.add('hidden');
        }
      };
    }
    el.techModal.classList.remove('hidden');
  }

  // ---- 通知 ----
  function notify(msg, type) {
    var div = document.createElement('div');
    div.className = 'notif ' + (type || '');
    div.textContent = msg;
    div.onclick = function () { div.remove(); };
    el.notif.appendChild(div);
    G.notifCount = (G.notifCount || 0) + 1;
    setTimeout(function () {
      if (div.parentNode) { div.style.transition = 'opacity .5s'; div.style.opacity = '0'; setTimeout(function () { div.remove(); }, 500); }
    }, 6000);
    if (el.notif.children.length > 5) el.notif.removeChild(el.notif.children[0]);
  }

  // ---- 日志 ----
  function openLog() {
    var html = '';
    for (var i = G.log.length - 1; i >= 0 && i >= G.log.length - 200; i--) {
      html += '<div class="l"><span>第' + G.log[i].t + '回合</span>' + G.log[i].msg + '</div>';
    }
    el.logBody.innerHTML = html || '暂无事件';
    el.logModal.classList.remove('hidden');
  }

  function fillHelp() {
    el.helpBody.innerHTML =
      '<h3>目标</h3><p>发展你的文明，达成以下任一胜利：</p>' +
      '<li><b>科学胜利</b>：研发全部科技。</li>' +
      '<li><b>统治胜利</b>：消灭所有对手文明（攻占其全部城市）。</li>' +
      '<li><b>分数胜利</b>：坚持到回合结束（或无可行胜利时分数最高）。</li>' +
      '<h3>基本操作</h3>' +
      '<li>左键点击我方单位选中；再点击高亮蓝格移动，点击红框敌军/城市发起攻击。</li>' +
      '<li>右下动作栏提供：建立城市、建造改良、驻防、解散等。</li>' +
      '<li>拖拽地图平移，滚轮缩放，方向键也可移动视角。</li>' +
      '<li><b>Y</b> 切换地块产出显示；<b>空格</b> 结束回合。</li>' +
      '<h3>小贴士</h3>' +
      '<li>开拓者建城；建造者在己方地块上改良（农场/矿山/牧场等）。</li>' +
      '<li>城市靠食物增长人口、靠产能建造单位与建筑。</li>' +
      '<li>丘陵/森林提供防御加成；河流旁建城获得淡水（更多住房）。</li>' +
      '<li>注意蛮族营地（⛺），会不断派出战士袭击，尽早剿灭。</li>';
  }

  function showEnd(win, text) {
    el.endTitle.textContent = win ? '🎉 胜利！' : '💀 失败';
    el.endText.innerHTML = text;
    el.endModal.classList.remove('hidden');
  }

  function isModalOpen() {
    return !!document.querySelector('.modal:not(.hidden)');
  }

  return {
    init: init, updateTopbar: updateTopbar, showSide: showSide, hideSide: hideSide,
    showActions: showActions, hideActions: hideActions, openCity: openCity,
    notify: notify, showEnd: showEnd, isModalOpen: isModalOpen,
    openCityById: function (id) { openCity(id); }
  };
})();
