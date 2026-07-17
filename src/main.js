(function bootCV6(global) {
  'use strict';

  const DATA = global.CV6_DATA;
  const { GameEngine, PLAYER_ID, tileKey } = global.CV6Game;
  const engine = new GameEngine();
  const SAVE_KEY = 'cv6-web-save-v2';
  const AUTOSAVE_KEY = 'cv6-web-autosave-v2';
  const SAVE_META_KEY = 'cv6-web-save-meta-v2';

  const ui = {
    selectedKind: null,
    selectedId: null,
    selectedX: null,
    selectedY: null,
    mode: null,
    reachable: {},
    attackTargets: [],
    showYields: true,
    showGrid: true,
    zoom: 1,
    researchTab: 'tech',
    productionFilter: 'all',
    managedCityId: null,
    victoryShown: false,
    eventsCollapsed: false,
  };

  const $ = (id) => document.getElementById(id);
  const formatNumber = (value) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  const formatYear = (year) => year < 0 ? `公元前 ${Math.abs(year)} 年` : `公元 ${year} 年`;
  const eraForTurn = (turn) => turn < 60 ? '远古时代' : turn < 105 ? '古典时代' : '中世纪';

  function initialize() {
    let loaded = false;
    try {
      const autosave = localStorage.getItem(AUTOSAVE_KEY);
      if (autosave) { engine.load(autosave); loaded = true; }
    } catch (error) {
      console.warn('Autosave unavailable:', error);
    }
    if (!loaded) engine.newGame();
    selectCapital(false);
    bindEvents();
    renderAll();
    if (!loaded) showToast('欢迎来到新汉。选择单位探索世界，或管理长安的生产。');
  }

  function player() { return engine.getCiv(PLAYER_ID); }
  function selectedUnit() { return ui.selectedKind === 'unit' ? engine.getUnit(ui.selectedId) : null; }
  function selectedCity() { return ui.selectedKind === 'city' ? engine.getCity(ui.selectedId) : null; }

  function selectCapital(render = true) {
    const capital = engine.getCapital(PLAYER_ID);
    if (!capital) return;
    ui.selectedKind = 'city';
    ui.selectedId = capital.id;
    ui.selectedX = capital.x;
    ui.selectedY = capital.y;
    clearMode();
    if (render) renderAll();
  }

  function selectUnit(unitId, render = true) {
    const unit = engine.getUnit(unitId);
    if (!unit) return;
    ui.selectedKind = 'unit';
    ui.selectedId = unit.id;
    ui.selectedX = unit.x;
    ui.selectedY = unit.y;
    clearMode();
    if (render) renderAll();
  }

  function selectCity(cityId, render = true) {
    const city = engine.getCity(cityId);
    if (!city) return;
    ui.selectedKind = 'city';
    ui.selectedId = city.id;
    ui.selectedX = city.x;
    ui.selectedY = city.y;
    clearMode();
    if (render) renderAll();
  }

  function selectTile(x, y, render = true) {
    ui.selectedKind = 'tile';
    ui.selectedId = null;
    ui.selectedX = x;
    ui.selectedY = y;
    clearMode();
    if (render) renderAll();
  }

  function clearMode() {
    ui.mode = null;
    ui.reachable = {};
    ui.attackTargets = [];
    $('mapNotice').hidden = true;
  }

  function renderAll() {
    renderTopbar();
    renderEntityLists();
    renderMap();
    renderDetails();
    renderCommands();
    renderEvents();
    renderEndTurnState();
    renderVictory();
  }

  function renderTopbar() {
    const state = engine.state;
    const civ = player();
    const yields = engine.getEmpireYield(PLAYER_ID);
    $('eraName').textContent = eraForTurn(state.turn);
    $('yearLabel').textContent = formatYear(state.year);
    $('turnLabel').textContent = `第 ${state.turn} 回合 · ${state.difficulty}`;
    $('sciencePerTurn').textContent = `+${formatNumber(yields.science)}`;
    $('culturePerTurn').textContent = `+${formatNumber(yields.culture)}`;
    $('goldTotal').textContent = Math.max(0, Math.round(civ.gold));
    const goldDelta = yields.gold + engine.getCities(PLAYER_ID).length * 2 - engine.getUnits(PLAYER_ID).length * .5;
    $('goldPerTurn').textContent = `${goldDelta >= 0 ? '+' : ''}${formatNumber(goldDelta)}/回合`;
    $('faithTotal').textContent = Math.round(civ.faith);
    $('eraScore').textContent = civ.eraScore;
    $('objectiveProgress').textContent = `${Math.min(12, civ.eraScore)} / 12`;
    $('objectiveMeter').style.width = `${Math.min(100, civ.eraScore / 12 * 100)}%`;

    if (civ.currentResearch) {
      const tech = DATA.TECHS[civ.currentResearch];
      const turns = Math.max(1, Math.ceil((tech.cost - civ.researchProgress) / Math.max(.1, yields.science)));
      $('researchName').textContent = `${tech.name} · ${turns}回合`;
    } else $('researchName').textContent = '选择研究';
    if (civ.currentCivic) {
      const civic = DATA.CIVICS[civ.currentCivic];
      const turns = Math.max(1, Math.ceil((civic.cost - civ.civicProgress) / Math.max(.1, yields.culture)));
      $('civicName').textContent = `${civic.name} · ${turns}回合`;
    } else $('civicName').textContent = '选择市政';
  }

  function renderEntityLists() {
    const cities = engine.getCities(PLAYER_ID);
    const units = engine.getUnits(PLAYER_ID);
    $('cityCount').textContent = cities.length;
    $('unitCount').textContent = units.length;
    $('cityList').replaceChildren(...cities.map((city) => {
      const yields = engine.getCityYield(city);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `entity-item city${ui.selectedKind === 'city' && ui.selectedId === city.id ? ' selected' : ''}`;
      item.innerHTML = `<span class="entity-icon">${city.isCapital ? '★' : '◆'}</span><span class="entity-copy"><strong>${city.name}</strong><small>人口 ${city.population} · ${formatNumber(yields.production)} 生产力</small></span><span class="entity-meta"><b>+${formatNumber(yields.food)} 粮</b><small>${city.hp}/${city.maxHp}</small></span>`;
      item.addEventListener('click', () => selectCity(city.id));
      return item;
    }));

    const sortedUnits = [...units].sort((a, b) => DATA.UNITS[a.type].civilian - DATA.UNITS[b.type].civilian || a.type.localeCompare(b.type));
    $('unitList').replaceChildren(...sortedUnits.map((unit) => {
      const definition = DATA.UNITS[unit.type];
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `entity-item${ui.selectedKind === 'unit' && ui.selectedId === unit.id ? ' selected' : ''}`;
      item.innerHTML = `<span class="entity-icon">${definition.symbol}</span><span class="entity-copy"><strong>${definition.name}</strong><small>${unit.movement}/${unit.maxMovement} 移动力 · 等级 ${unit.level}</small></span><span class="entity-meta"><b>${unit.hp}</b><span class="hp-mini"><i style="width:${unit.hp}%"></i></span></span>`;
      item.addEventListener('click', () => selectUnit(unit.id));
      return item;
    }));
  }

  function renderMap() {
    const civ = player();
    const fragment = document.createDocumentFragment();
    engine.state.tiles.forEach((tile) => {
      const key = tileKey(tile.x, tile.y);
      const revealed = Boolean(civ.revealed[key]);
      const visible = Boolean(civ.visible[key]);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `hex terrain-${tile.terrain}${tile.feature ? ` feature-${tile.feature}` : ''}${ui.showGrid ? ' grid-on' : ''}`;
      button.style.setProperty('--x', tile.x);
      button.style.setProperty('--y', tile.y);
      button.dataset.odd = String(tile.y % 2 === 1);
      button.setAttribute('role', 'gridcell');
      if (!revealed) button.classList.add('is-unrevealed');
      else if (!visible) button.classList.add('is-fogged');
      if (ui.selectedX === tile.x && ui.selectedY === tile.y) button.classList.add('is-selected');
      if (ui.mode === 'move' && ui.reachable[key] !== undefined) button.classList.add('is-reachable');
      if (ui.mode === 'attack' && ui.attackTargets.some((target) => target.x === tile.x && target.y === tile.y)) button.classList.add('is-attackable');

      const terrain = DATA.TERRAINS[tile.terrain];
      const feature = DATA.FEATURES[tile.feature];
      button.setAttribute('aria-label', revealed ? `${terrain.name}${feature ? `，${feature.name}` : ''}，坐标 ${tile.x + 1}-${tile.y + 1}` : '未知地块');
      if (!revealed) {
        button.innerHTML = '<span class="selection-ring"></span>';
        fragment.append(button);
        return;
      }

      const owner = tile.owner ? engine.getCiv(tile.owner) : null;
      if (owner) {
        button.style.setProperty('--owner-color', owner.color);
        button.style.setProperty('--civ-color', owner.color);
        button.style.setProperty('--civ-dark', owner.dark);
      }
      let markup = owner ? '<span class="owner-ring"></span><span class="owner-inner"></span>' : '';
      markup += `<span class="selection-ring"></span><span class="tile-symbol">${feature?.icon || terrain.icon}</span>`;
      if (tile.river) markup += '<span class="river-mark">≈</span>';
      const resource = visibleResource(tile, civ);
      if (resource) markup += `<span class="resource-mark" title="${resource.name}">${resource.icon}</span>`;
      if (tile.improvement) markup += `<span class="improvement-mark" title="${DATA.IMPROVEMENTS[tile.improvement].name}">${DATA.IMPROVEMENTS[tile.improvement].icon}</span>`;
      if (ui.showYields) markup += renderYieldPips(engine.getTileYields(tile, PLAYER_ID));
      const city = engine.getCityAt(tile.x, tile.y);
      if (city) {
        const cityCiv = engine.getCiv(city.owner);
        button.style.setProperty('--civ-color', cityCiv.color);
        button.style.setProperty('--civ-dark', cityCiv.dark);
        markup += `<span class="city-marker"><i class="city-pop">${city.population}</i><strong>${city.name}</strong><i class="city-hp">${Math.ceil(city.hp / city.maxHp * 10)}</i></span>`;
      }
      const units = engine.getUnitsAt(tile.x, tile.y).filter((unit) => unit.owner === PLAYER_ID || visible);
      if (units.length) {
        const unit = units.find((item) => item.id === ui.selectedId) || units.find((item) => !DATA.UNITS[item.type].civilian) || units[0];
        const definition = DATA.UNITS[unit.type];
        const unitCiv = engine.getCiv(unit.owner);
        button.style.setProperty('--civ-color', unitCiv.color);
        button.style.setProperty('--civ-dark', unitCiv.dark);
        markup += `<span class="unit-marker${definition.civilian ? ' civilian' : ''}${unit.hp < 60 ? ' damaged' : ''}">${definition.symbol}</span>`;
        if (units.length > 1) markup += `<span class="stack-count">${units.length}</span>`;
      }
      button.innerHTML = markup;
      button.addEventListener('click', () => handleTileClick(tile.x, tile.y));
      fragment.append(button);
    });
    $('mapGrid').replaceChildren(fragment);
    $('mapLayer').style.transform = `scale(${ui.zoom})`;
    $('yieldToggle').classList.toggle('active', ui.showYields);
    $('gridToggle').classList.toggle('active', ui.showGrid);
  }

  function visibleResource(tile, civ) {
    const resource = DATA.RESOURCES[tile.resource];
    if (!resource) return null;
    if (resource.revealTech && !civ.researched.includes(resource.revealTech)) return null;
    return resource;
  }

  function renderYieldPips(yields) {
    const definitions = [
      ['food', 'F'], ['production', 'P'], ['gold', 'G'], ['science', 'S'], ['culture', 'C'],
    ];
    const pips = definitions.filter(([name]) => yields[name] > 0).map(([name, symbol]) => `<i class="yield-pip ${name}">${symbol}${formatNumber(yields[name])}</i>`).join('');
    return pips ? `<span class="yield-row">${pips}</span>` : '';
  }

  function handleTileClick(x, y) {
    const key = tileKey(x, y);
    if (!player().revealed[key]) return;
    const unit = selectedUnit();
    if (ui.mode === 'move' && unit && ui.reachable[key] !== undefined) {
      const result = engine.moveUnit(unit.id, x, y);
      if (result.ok) {
        const surviving = engine.getUnit(unit.id);
        if (surviving) { ui.selectedX = surviving.x; ui.selectedY = surviving.y; }
        else selectTile(x, y, false);
        clearMode();
        autoSave();
      }
      showResult(result);
      renderAll();
      return;
    }
    if (ui.mode === 'attack' && unit) {
      const target = ui.attackTargets.find((item) => item.x === x && item.y === y);
      if (target) {
        const result = target.kind === 'unit' ? engine.attackUnit(unit.id, target.id, true) : engine.attackCity(unit.id, target.id, true);
        if (!engine.getUnit(unit.id)) selectTile(x, y, false);
        clearMode();
        autoSave();
        showResult(result);
        renderAll();
        return;
      }
    }

    const units = engine.getUnitsAt(x, y);
    const ownUnit = units.find((item) => item.owner === PLAYER_ID && !DATA.UNITS[item.type].civilian) || units.find((item) => item.owner === PLAYER_ID);
    const city = engine.getCityAt(x, y);
    if (ownUnit) selectUnit(ownUnit.id);
    else if (city) selectCity(city.id);
    else selectTile(x, y);
  }

  function renderDetails() {
    const tile = engine.getTile(ui.selectedX, ui.selectedY) || engine.getTile(2, 4);
    const terrain = DATA.TERRAINS[tile.terrain];
    const feature = DATA.FEATURES[tile.feature];
    const resource = visibleResource(tile, player());
    const improvement = DATA.IMPROVEMENTS[tile.improvement];
    const city = selectedCity() || engine.getCityAt(tile.x, tile.y);
    const unit = selectedUnit();
    const owner = tile.owner ? engine.getCiv(tile.owner) : null;
    const yields = engine.getTileYields(tile, PLAYER_ID);

    $('detailEyebrow').textContent = unit ? '单位与地块' : city ? '城市与地块' : '地块情报';
    $('detailTitle').textContent = unit ? DATA.UNITS[unit.type].name : city ? city.name : terrain.name;
    $('detailCoordinate').textContent = `${tile.x + 1} · ${tile.y + 1}`;
    $('terrainIcon').textContent = feature?.icon || terrain.icon;
    $('terrainName').textContent = terrain.name;
    $('terrainFeatures').textContent = [feature?.name, tile.river ? '河流' : null, resource?.name].filter(Boolean).join(' · ') || '无地貌特征';
    $('tileYields').innerHTML = [
      ['food', '✦', '粮食'], ['production', '⚒', '生产'], ['gold', '◈', '金币'], ['science', '⚗', '科技'], ['culture', '❖', '文化'],
    ].map(([name, icon, label]) => `<div class="yield-card ${name}"><i>${icon}</i><b>${formatNumber(yields[name])}</b><span>${label}</span></div>`).join('');
    $('ownerBadge').textContent = owner ? owner.name : '未拥有';
    $('tileDescription').textContent = tileDescription(tile, resource, improvement);
    const tags = [feature?.name, tile.river ? '淡水' : null, resource ? `${resource.name} · ${resource.type === 'luxury' ? '奢侈' : resource.type === 'strategic' ? '战略' : '加成'}` : null, improvement?.name, DATA.TERRAINS[tile.terrain].water ? '水域' : '陆地'].filter(Boolean);
    $('tileTags').innerHTML = tags.map((tag) => `<span>${tag}</span>`).join('');
    $('cityDetailSection').hidden = !city;
    if (city) renderCityDetail(city);

    $('selectionType').textContent = unit ? `${DATA.CIVILIZATIONS[unit.owner].name}单位` : city ? `${DATA.CIVILIZATIONS[city.owner].name}城市` : '世界地图';
    $('selectionName').textContent = unit ? DATA.UNITS[unit.type].name : city ? city.name : `${terrain.name}${feature ? ` · ${feature.name}` : ''}`;
    $('selectionEmblem').textContent = unit ? DATA.UNITS[unit.type].symbol : city ? (city.isCapital ? '★' : '◆') : feature?.icon || terrain.icon;
    $('selectionDescription').textContent = unit ? unitDescription(unit) : city ? cityDescription(city) : tileDescription(tile, resource, improvement);
    $('unitHealth').hidden = !unit;
    if (unit) {
      $('unitHealthBar').style.width = `${unit.hp}%`;
      $('unitHealthBar').style.background = unit.hp < 40 ? 'var(--red)' : unit.hp < 70 ? 'var(--gold)' : 'var(--green)';
      $('unitHealthText').textContent = unit.hp;
    }
  }

  function tileDescription(tile, resource, improvement) {
    const terrain = DATA.TERRAINS[tile.terrain];
    const feature = DATA.FEATURES[tile.feature];
    const parts = [`${terrain.name}提供文明发展的基础产出。`];
    if (feature) parts.push(`${feature.name}会影响移动与防御。`);
    if (resource) parts.push(`这里蕴藏${resource.name}，建造对应设施可以提高产出。`);
    if (improvement) parts.push(`已建造${improvement.name}。`);
    return parts.join('');
  }

  function unitDescription(unit) {
    const definition = DATA.UNITS[unit.type];
    if (definition.civilian) return `${unit.movement}/${unit.maxMovement} 移动力 · ${unit.charges ? `${unit.charges} 次使用次数` : '平民单位'}。`;
    return `战斗力 ${definition.strength} · ${unit.movement}/${unit.maxMovement} 移动力 · 等级 ${unit.level} · ${unit.xp} 经验。`;
  }

  function cityDescription(city) {
    const yields = engine.getCityYield(city);
    return `人口 ${city.population}，每回合产出 ${formatNumber(yields.food)} 粮食、${formatNumber(yields.production)} 生产力与 ${formatNumber(yields.science)} 科技。`;
  }

  function renderCityDetail(city) {
    const yields = engine.getCityYield(city);
    const growthCost = 12 + city.population * 8;
    $('cityStatusGrid').innerHTML = `<div><b>${city.population}</b><span>人口</span></div><div><b>${city.housing}</b><span>住房</span></div><div><b>${city.defense}</b><span>防御</span></div>`;
    if (city.queue) {
      const definition = city.queue.kind === 'unit' ? DATA.UNITS[city.queue.id] : DATA.BUILDINGS[city.queue.id];
      const turns = Math.max(1, Math.ceil((definition.cost - city.productionStored) / Math.max(.1, yields.production)));
      $('cityProductionIcon').textContent = definition.symbol || definition.icon;
      $('cityProductionName').textContent = definition.name;
      $('cityProductionTurns').textContent = `还需 ${turns} 回合 · 人口成长 ${Math.round(city.foodStored / growthCost * 100)}%`;
      $('cityProductionMeter').style.width = `${Math.min(100, city.productionStored / definition.cost * 100)}%`;
    } else {
      $('cityProductionIcon').textContent = '＋';
      $('cityProductionName').textContent = '选择生产项目';
      $('cityProductionTurns').textContent = city.owner === PLAYER_ID ? '等待你的命令' : '暂无情报';
      $('cityProductionMeter').style.width = '0%';
    }
    $('manageCityButton').hidden = city.owner !== PLAYER_ID;
  }

  function renderCommands() {
    const container = $('commandActions');
    container.replaceChildren();
    const unit = selectedUnit();
    const city = selectedCity();
    if (unit && unit.owner === PLAYER_ID) {
      const definition = DATA.UNITS[unit.type];
      container.append(commandButton('⌖', '移动', () => toggleMoveMode(unit), { active: ui.mode === 'move', disabled: unit.movement <= 0 }));
      if (definition.rangedStrength) container.append(commandButton('◎', '远程攻击', () => toggleAttackMode(unit), { active: ui.mode === 'attack', disabled: unit.movement <= 0 || engine.getAttackTargets(unit.id).length === 0 }));
      if (!definition.civilian) {
        container.append(commandButton('▣', '驻防', () => executeResult(engine.fortifyUnit(unit.id)), { disabled: unit.movement <= 0 }));
        container.append(commandButton('✚', '休整', () => executeResult(engine.healUnit(unit.id)), { disabled: unit.movement <= 0 || unit.hp >= unit.maxHp }));
      }
      if (unit.type === 'settler') container.append(commandButton('★', '建立城市', () => executeSettle(unit), { disabled: !engine.canSettle(unit.id) }));
      if (unit.type === 'builder') {
        const options = engine.getImprovementOptions(unit.id);
        options.forEach((improvementId) => container.append(commandButton(DATA.IMPROVEMENTS[improvementId].icon, DATA.IMPROVEMENTS[improvementId].name, () => executeImprovement(unit, improvementId), { disabled: unit.movement <= 0 })));
      }
    } else if (city && city.owner === PLAYER_ID) {
      container.append(commandButton('⚒', '选择生产', () => openProduction(city.id)));
      container.append(commandButton('⌖', '定位城市', () => showMapNotice(`${city.name}位于 ${city.x + 1}-${city.y + 1}`)));
    } else {
      container.append(commandButton('斥', '选择斥候', () => {
        const scout = engine.getUnits(PLAYER_ID).find((item) => item.type === 'scout');
        if (scout) selectUnit(scout.id); else showToast('你目前没有斥候。', true);
      }));
      container.append(commandButton('★', '返回首都', () => selectCapital()));
    }
  }

  function commandButton(icon, label, handler, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `command-button${options.active ? ' active' : ''}${options.danger ? ' danger' : ''}`;
    button.disabled = Boolean(options.disabled);
    button.innerHTML = `<span>${icon}</span><b>${label}</b>`;
    button.addEventListener('click', handler);
    return button;
  }

  function toggleMoveMode(unit) {
    if (ui.mode === 'move') { clearMode(); renderAll(); return; }
    ui.mode = 'move';
    ui.reachable = engine.getReachable(unit.id);
    ui.attackTargets = [];
    showMapNotice('绿色地块可以抵达；点击敌军会发动近战攻击。');
    renderMap();
    renderCommands();
  }

  function toggleAttackMode(unit) {
    if (ui.mode === 'attack') { clearMode(); renderAll(); return; }
    ui.mode = 'attack';
    ui.reachable = {};
    ui.attackTargets = engine.getAttackTargets(unit.id);
    showMapNotice('红色地块处于远程攻击范围。');
    renderMap();
    renderCommands();
  }

  function executeResult(result) {
    clearMode();
    showResult(result);
    if (result.ok) autoSave();
    renderAll();
  }

  function executeSettle(unit) {
    const result = engine.settleCity(unit.id);
    if (result.ok) selectCity(result.cityId, false);
    executeResult(result);
  }

  function executeImprovement(unit, improvementId) {
    const result = engine.buildImprovement(unit.id, improvementId);
    if (!engine.getUnit(unit.id)) selectTile(unit.x, unit.y, false);
    executeResult(result);
  }

  function renderEvents() {
    const events = engine.state.events;
    $('eventLog').hidden = ui.eventsCollapsed;
    $('clearEventsButton').textContent = ui.eventsCollapsed ? '展开' : '收起';
    $('eventLog').innerHTML = events.length ? events.map((event) => `<article class="event-item"><i class="event-dot ${event.type}"></i><div><strong>${event.title}</strong><p>${event.text}</p></div><time>T${event.turn}</time></article>`).join('') : '<p>历史尚未留下新的记录。</p>';
  }

  function renderEndTurnState() {
    const civ = player();
    const idleCity = engine.getCities(PLAYER_ID).find((city) => !city.queue);
    const button = $('endTurnButton');
    button.classList.remove('needs-choice');
    if (!civ.currentResearch && engine.getAvailableTechs(PLAYER_ID).length) {
      $('endTurnText').textContent = '选择科技'; button.classList.add('needs-choice');
    } else if (!civ.currentCivic && engine.getAvailableCivics(PLAYER_ID).length) {
      $('endTurnText').textContent = '选择市政'; button.classList.add('needs-choice');
    } else if (idleCity) {
      $('endTurnText').textContent = `${idleCity.name}需生产`; button.classList.add('needs-choice');
    } else $('endTurnText').textContent = '下一回合';
  }

  function handleEndTurn() {
    const civ = player();
    if (!civ.currentResearch && engine.getAvailableTechs(PLAYER_ID).length) { openResearch('tech'); return; }
    if (!civ.currentCivic && engine.getAvailableCivics(PLAYER_ID).length) { openResearch('civic'); return; }
    const idleCity = engine.getCities(PLAYER_ID).find((city) => !city.queue);
    if (idleCity) { selectCity(idleCity.id, false); openProduction(idleCity.id); renderAll(); return; }
    clearMode();
    $('endTurnButton').disabled = true;
    $('endTurnText').textContent = 'AI 行动中…';
    window.setTimeout(() => {
      const result = engine.endTurn();
      autoSave();
      repairSelection();
      showResult(result);
      $('endTurnButton').disabled = false;
      renderAll();
    }, 180);
  }

  function repairSelection() {
    if (ui.selectedKind === 'unit' && !engine.getUnit(ui.selectedId)) selectCapital(false);
    if (ui.selectedKind === 'city' && !engine.getCity(ui.selectedId)) selectCapital(false);
    const unit = selectedUnit(); const city = selectedCity();
    if (unit) { ui.selectedX = unit.x; ui.selectedY = unit.y; }
    if (city) { ui.selectedX = city.x; ui.selectedY = city.y; }
  }

  function openResearch(tab) {
    ui.researchTab = tab;
    renderResearchModal();
    $('researchModal').showModal();
  }

  function renderResearchModal() {
    const civ = player();
    const isTech = ui.researchTab === 'tech';
    const source = isTech ? DATA.TECHS : DATA.CIVICS;
    const completed = isTech ? civ.researched : civ.completedCivics;
    const current = isTech ? civ.currentResearch : civ.currentCivic;
    const progress = isTech ? civ.researchProgress : civ.civicProgress;
    const available = isTech ? engine.getAvailableTechs(PLAYER_ID) : engine.getAvailableCivics(PLAYER_ID);
    const perTurn = engine.getEmpireYield(PLAYER_ID)[isTech ? 'science' : 'culture'];
    document.querySelectorAll('[data-research-tab]').forEach((button) => button.classList.toggle('active', button.dataset.researchTab === ui.researchTab));
    if (current) {
      const item = source[current];
      const turns = Math.max(1, Math.ceil((item.cost - progress) / Math.max(.1, perTurn)));
      $('researchSummary').textContent = `正在推进：${item.name} · ${formatNumber(progress)} / ${item.cost} · 预计 ${turns} 回合完成。`;
    } else $('researchSummary').textContent = `当前没有${isTech ? '科技' : '市政'}项目。选择一个已解锁项目开始推进。`;
    $('researchGrid').replaceChildren(...Object.entries(source).map(([id, item]) => {
      const state = completed.includes(id) ? 'completed' : current === id ? 'active' : available.includes(id) ? 'available' : 'locked';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `research-card ${state}`;
      card.disabled = state === 'locked' || state === 'completed' || state === 'active';
      const unlocks = item.unlocks?.join('、') || '暂无解锁项目';
      card.innerHTML = `<span class="card-icon">${item.icon}</span><span class="card-cost">${item.cost} ${isTech ? '⚗' : '❖'}</span><h3>${item.name}</h3><p>${item.era} · 解锁 ${unlocks}</p><span class="card-state">${state === 'completed' ? '已完成' : state === 'active' ? '研究中' : state === 'available' ? '可选择' : '需要前置'}</span>`;
      if (state === 'available') card.addEventListener('click', () => {
        const result = isTech ? engine.setResearch(PLAYER_ID, id) : engine.setCivic(PLAYER_ID, id);
        showResult(result);
        if (result.ok) { $('researchModal').close(); autoSave(); renderAll(); }
      });
      return card;
    }));
  }

  function openProduction(cityId) {
    const city = engine.getCity(cityId);
    if (!city || city.owner !== PLAYER_ID) return;
    ui.managedCityId = city.id;
    ui.productionFilter = 'all';
    renderProductionModal();
    $('productionModal').showModal();
  }

  function renderProductionModal() {
    const city = engine.getCity(ui.managedCityId);
    if (!city) return;
    const yields = engine.getCityYield(city);
    $('productionCityName').textContent = `${city.name} · 选择生产`;
    $('cityOverview').innerHTML = `<div><b>${city.population}</b><span>人口</span></div><div><b>${city.housing}</b><span>住房</span></div><div><b>${formatNumber(yields.food)}</b><span>粮食</span></div><div><b>${formatNumber(yields.production)}</b><span>生产力</span></div><div><b>${city.buildings.length}</b><span>建筑</span></div>`;
    document.querySelectorAll('[data-production-filter]').forEach((button) => button.classList.toggle('active', button.dataset.productionFilter === ui.productionFilter));
    const options = engine.getProductionOptions(city.id).filter((option) => ui.productionFilter === 'all' || option.kind === ui.productionFilter);
    $('productionGrid').replaceChildren(...options.map((option) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'production-card';
      card.disabled = option.disabled;
      const turns = Math.max(1, Math.ceil(option.cost / Math.max(.1, yields.production)));
      card.innerHTML = `<span class="card-icon">${option.icon}</span><span class="card-cost">${option.cost} ⚒</span><h3>${option.name}</h3><p>${option.description || (option.kind === 'unit' ? '训练一支新的单位，为文明服务。' : '')}${option.reason ? ` ${option.reason}` : ''}</p><span class="turn-estimate">预计 ${turns} 回合</span>`;
      card.addEventListener('click', () => {
        const result = engine.setCityProduction(city.id, option.kind, option.id);
        showResult(result);
        if (result.ok) { $('productionModal').close(); autoSave(); renderAll(); }
      });
      return card;
    }));
  }

  function renderDiplomacy() {
    const civ = player();
    $('diplomacyList').replaceChildren(...engine.state.civilizations.filter((other) => other.id !== PLAYER_ID).map((other) => {
      const relation = civ.relations[other.id];
      const card = document.createElement('article');
      card.className = 'diplomacy-card';
      card.style.setProperty('--civ-color', other.color);
      card.style.setProperty('--civ-dark', other.dark);
      if (!relation.met) {
        card.innerHTML = `<div class="diplomacy-portrait">?</div><div><h3>尚未接触的文明</h3><p>派遣斥候继续探索世界，才能展开外交。</p><span class="relation-state">未知</span></div>`;
        return card;
      }
      const stateName = relation.status === 'war' ? `战争 · ${relation.warTurns} 回合` : relation.opinion >= 10 ? '友好' : relation.opinion <= -10 ? '不友好' : '中立';
      card.innerHTML = `<div class="diplomacy-portrait">${other.leader.slice(0, 1)}</div><div><h3>${other.leader} · ${other.name}</h3><p>${DATA.CIVILIZATIONS[other.id].trait}</p><span class="relation-state ${relation.status}">${stateName} · 态度 ${relation.opinion}</span></div><div class="diplomacy-actions"></div>`;
      const actions = card.querySelector('.diplomacy-actions');
      const button = document.createElement('button');
      button.type = 'button';
      if (relation.status === 'war') {
        button.textContent = '提出和平';
        button.addEventListener('click', () => { const result = engine.proposePeace(PLAYER_ID, other.id); showResult(result); if (result.ok) { autoSave(); renderDiplomacy(); renderAll(); } });
      } else {
        button.textContent = '正式宣战';
        button.className = 'danger';
        button.addEventListener('click', () => { const result = engine.declareWar(PLAYER_ID, other.id); showResult(result); if (result.ok) { autoSave(); renderDiplomacy(); renderAll(); } });
      }
      actions.append(button);
      return card;
    }));
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, engine.serialize());
      const meta = { savedAt: new Date().toLocaleString('zh-CN'), turn: engine.state.turn, year: engine.state.year, seed: engine.state.seed };
      localStorage.setItem(SAVE_META_KEY, JSON.stringify(meta));
      $('saveStatus').textContent = `已保存 · 第 ${engine.state.turn} 回合`;
      updateSaveMeta();
      showToast('游戏已保存到浏览器。');
    } catch (error) { showToast(`保存失败：${error.message}`, true); }
  }

  function autoSave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, engine.serialize());
      $('saveStatus').textContent = `自动存档 · 第 ${engine.state.turn} 回合`;
    } catch (error) { $('saveStatus').textContent = '自动存档不可用'; }
  }

  function loadGame() {
    try {
      const saved = localStorage.getItem(SAVE_KEY) || localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) { showToast('没有找到可用存档。', true); return; }
      engine.load(saved);
      ui.victoryShown = false;
      selectCapital(false);
      $('menuModal').close();
      renderAll();
      showToast(`已读取第 ${engine.state.turn} 回合存档。`);
    } catch (error) { showToast(`读取失败：${error.message}`, true); }
  }

  function updateSaveMeta() {
    try {
      const meta = JSON.parse(localStorage.getItem(SAVE_META_KEY) || 'null');
      $('saveMeta').textContent = meta ? `最近存档：${meta.savedAt} · 第 ${meta.turn} 回合 · 种子 ${meta.seed}` : '尚无手动存档；每次行动后会自动保存。';
    } catch (error) { $('saveMeta').textContent = '存档信息不可用。'; }
  }

  function startNewGame() {
    const seed = $('seedInput').value.trim() || `CV6-${Date.now().toString(36)}`;
    const difficulty = $('difficultySelect').value;
    engine.newGame({ seed, difficulty });
    ui.victoryShown = false;
    ui.zoom = 1;
    selectCapital(false);
    autoSave();
    $('newGameModal').close();
    $('menuModal').close();
    renderAll();
    showToast(`新世界已经生成 · 种子 ${seed}`);
  }

  function renderVictory() {
    if (!engine.state.winner || ui.victoryShown) return;
    const winner = engine.getCiv(engine.state.winner);
    $('victoryTitle').textContent = engine.state.victoryType;
    $('victoryText').textContent = winner?.id === PLAYER_ID ? `你带领新汉赢得了${engine.state.victoryType}。历史将记住你在 ${engine.state.turn} 个回合中建立的文明。` : `${winner?.name || '另一个文明'}赢得了${engine.state.victoryType}。新汉的历史在此告一段落。`;
    ui.victoryShown = true;
    $('victoryModal').showModal();
  }

  function showResult(result) { showToast(result.message, !result.ok); }
  function showToast(message, error = false) {
    const toast = document.createElement('div');
    toast.className = `toast${error ? ' error' : ''}`;
    toast.textContent = message;
    $('toastStack').append(toast);
    window.setTimeout(() => { toast.classList.add('out'); window.setTimeout(() => toast.remove(), 230); }, 3000);
  }

  function showMapNotice(message) {
    $('mapNotice').textContent = message;
    $('mapNotice').hidden = false;
  }

  function bindEvents() {
    $('endTurnButton').addEventListener('click', handleEndTurn);
    $('researchButton').addEventListener('click', () => openResearch('tech'));
    $('civicButton').addEventListener('click', () => openResearch('civic'));
    $('diplomacyButton').addEventListener('click', () => { renderDiplomacy(); $('diplomacyModal').showModal(); });
    $('menuButton').addEventListener('click', () => { updateSaveMeta(); $('menuModal').showModal(); });
    $('yieldToggle').addEventListener('click', () => { ui.showYields = !ui.showYields; renderMap(); });
    $('gridToggle').addEventListener('click', () => { ui.showGrid = !ui.showGrid; renderMap(); });
    $('zoomInButton').addEventListener('click', () => { ui.zoom = Math.min(1.35, ui.zoom + .1); renderMap(); });
    $('zoomOutButton').addEventListener('click', () => { ui.zoom = Math.max(.72, ui.zoom - .1); renderMap(); });
    $('manageCityButton').addEventListener('click', () => { const city = selectedCity() || engine.getCityAt(ui.selectedX, ui.selectedY); if (city) openProduction(city.id); });
    $('clearEventsButton').addEventListener('click', () => { ui.eventsCollapsed = !ui.eventsCollapsed; renderEvents(); });
    document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
    document.querySelectorAll('[data-research-tab]').forEach((button) => button.addEventListener('click', () => { ui.researchTab = button.dataset.researchTab; renderResearchModal(); }));
    document.querySelectorAll('[data-production-filter]').forEach((button) => button.addEventListener('click', () => { ui.productionFilter = button.dataset.productionFilter; renderProductionModal(); }));
    $('saveGameButton').addEventListener('click', saveGame);
    $('loadGameButton').addEventListener('click', loadGame);
    $('newGameButton').addEventListener('click', () => { $('seedInput').value = `CV6-${Date.now().toString(36).toUpperCase()}`; $('newGameModal').showModal(); });
    $('helpButton').addEventListener('click', () => $('helpModal').showModal());
    $('confirmNewGameButton').addEventListener('click', startNewGame);
    $('victoryContinueButton').addEventListener('click', () => $('victoryModal').close());
    document.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || document.querySelector('dialog[open]')) return;
      const key = event.key.toLowerCase();
      if (event.code === 'Space') { event.preventDefault(); handleEndTurn(); }
      else if (key === 'm' && selectedUnit()) toggleMoveMode(selectedUnit());
      else if (key === 'f' && selectedUnit()) executeResult(engine.fortifyUnit(selectedUnit().id));
      else if (key === 'r') openResearch('tech');
      else if (key === 'escape') { clearMode(); renderAll(); }
    });
  }

  initialize();
})(window);
