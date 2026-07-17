const terrainRows = [
  ['coast', 'coast', 'coast', 'coast', 'coast', 'coast', 'coast', 'coast', 'coast'],
  ['coast', 'hills', 'forest', 'plains', 'grass', 'hills', 'forest', 'coast', 'coast'],
  ['coast', 'plains', 'plains', 'grass', 'river', 'plains', 'hills', 'forest', 'coast'],
  ['coast', 'grass', 'river', 'river', 'plains', 'hills', 'forest', 'plains', 'coast'],
  ['coast', 'forest', 'hills', 'plains', 'plains', 'grass', 'desert', 'plains', 'coast'],
  ['coast', 'coast', 'hills', 'forest', 'plains', 'grass', 'desert', 'hills', 'coast'],
  ['coast', 'coast', 'coast', 'coast', 'coast', 'coast', 'coast', 'coast', 'coast'],
];

const terrainInfo = {
  plains: { label: '平原', subtitle: '开阔地 · 适合农场', icon: '·', copy: '开阔而平坦的土地，适合早期城市和农场发展。', yields: [2, 1, 0], tags: ['可开发', '平坦'] },
  grass: { label: '草原', subtitle: '草地 · 肥沃', icon: '⌁', copy: '茂盛的草地带来充足粮食，是人口增长的理想地块。', yields: [3, 0, 0], tags: ['可开发', '肥沃'] },
  hills: { label: '丘陵', subtitle: '高地 · 视野开阔', icon: '⌃', copy: '丘陵提供额外生产力，也能让斥候更早发现远方的文明。', yields: [1, 2, 0], tags: ['高地', '可采矿'] },
  forest: { label: '森林', subtitle: '森林 · 木材', icon: '♠', copy: '古老森林蕴藏着木材。清理后可立即获得一笔生产力。', yields: [1, 2, 0], tags: ['森林', '可砍伐'] },
  desert: { label: '沙漠', subtitle: '沙海 · 炎热', icon: '∴', copy: '贫瘠的沙地暂时无法支撑人口，但可能隐藏着珍贵资源。', yields: [0, 0, 0], tags: ['沙漠', '未开发'] },
  coast: { label: '海岸', subtitle: '海洋 · 淡水边缘', icon: '≈', copy: '沿海地块连接着更广阔的世界，可以建造港口并探索海洋。', yields: [1, 0, 1], tags: ['沿海', '可航行'] },
  river: { label: '河谷平原', subtitle: '草原 · 淡水', icon: '⌁', copy: '肥沃的冲积土让这里适合发展一座伟大的城市。河流为农场提供额外粮食。', yields: [2, 1, 0], tags: ['淡水', '可开发'] },
};

const techs = [
  { id: 'writing', name: '写作', turns: 0, state: 'done', description: '解锁学院区与大科学家点数。' },
  { id: 'pottery', name: '制陶术', turns: 2, state: 'available', description: '解锁粮仓与灌溉研究路径。' },
  { id: 'irrigation', name: '灌溉', turns: 5, state: 'locked', description: '改良香蕉与种植园资源。' },
  { id: 'mining', name: '采矿', turns: 4, state: 'available', description: '解锁矿山与丘陵生产力。' },
  { id: 'bronze', name: '青铜器', turns: 7, state: 'locked', description: '揭示铁资源并训练重装步兵。' },
  { id: 'sailing', name: '航海术', turns: 6, state: 'available', description: '解锁桨帆船与海上贸易。' },
];

const state = {
  turn: 24,
  year: -320,
  food: 7,
  science: 18,
  culture: 11,
  gold: 143,
  selected: { type: 'tile', key: '4-3' },
  selectedUnit: null,
  movementMode: false,
  showYields: true,
  showGrid: false,
  sound: true,
  cities: [{ id: 'chang-an', name: '长安', x: 4, y: 3, population: 4 }],
  units: [
    { id: 'scout-1', type: 'scout', name: '斥候', symbol: 'S', x: 2, y: 2, movement: 2, maxMovement: 2, status: '探索中' },
    { id: 'warrior-1', type: 'warrior', name: '勇士', symbol: 'W', x: 5, y: 4, movement: 2, maxMovement: 2, status: '待命' },
    { id: 'settler-1', type: 'settler', name: '开拓者', symbol: '＋', x: 6, y: 2, movement: 2, maxMovement: 2, status: '准备定居' },
  ],
  logs: ['斥候发现了北方的香料资源。', '长安完成了纪念碑建设。'],
};

const $ = (id) => document.getElementById(id);
const mapGrid = $('mapGrid');

function key(x, y) { return `${x}-${y}`; }
function getTile(x, y) { return terrainRows[y]?.[x]; }
function getUnitAt(x, y) { return state.units.find((unit) => unit.x === x && unit.y === y); }
function getCityAt(x, y) { return state.cities.find((city) => city.x === x && city.y === y); }
function getSelectedUnit() { return state.units.find((unit) => unit.id === state.selectedUnit); }

function neighbors(x, y) {
  const diagonalX = y % 2 === 0 ? -1 : 1;
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1], [x + diagonalX, y - 1], [x + diagonalX, y + 1]]
    .filter(([nx, ny]) => nx >= 0 && nx < 9 && ny >= 0 && ny < 7 && getTile(nx, ny) !== 'coast');
}

function tileIsMoveTarget(x, y) {
  const unit = getSelectedUnit();
  return Boolean(state.movementMode && unit && unit.movement > 0 && neighbors(unit.x, unit.y).some(([nx, ny]) => nx === x && ny === y) && !getCityAt(x, y));
}

function tileLabel(terrain, x, y) {
  if (terrain === 'coast') return '';
  const feature = terrainInfo[terrain];
  if ((x + y) % 4 === 0) return feature.label;
  return '';
}

function renderMap() {
  mapGrid.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let y = 0; y < terrainRows.length; y += 1) {
    for (let x = 0; x < terrainRows[y].length; x += 1) {
      const terrain = terrainRows[y][x];
      const tile = document.createElement('button');
      const tileKey = key(x, y);
      const unit = getUnitAt(x, y);
      const city = getCityAt(x, y);
      const info = terrainInfo[terrain];
      tile.type = 'button';
      tile.className = `hex ${terrain}${state.showGrid ? '' : ' grid-hidden'}`;
      if (state.selected.type === 'tile' && state.selected.key === tileKey) tile.classList.add('is-selected');
      if (state.selected.type === 'unit' && state.selected.key === tileKey) tile.classList.add('is-selected');
      if (tileIsMoveTarget(x, y)) tile.classList.add('is-move-target');
      if (city) tile.classList.add('is-city');
      if (unit) { tile.classList.add('is-unit'); tile.dataset.unitSymbol = unit.symbol; }
      tile.dataset.x = x;
      tile.dataset.y = y;
      tile.setAttribute('role', 'gridcell');
      tile.setAttribute('aria-label', `${info.label}，坐标 ${x + 1}-${y + 1}${city ? `，城市 ${city.name}` : ''}${unit ? `，${unit.name}` : ''}`);
      tile.innerHTML = `<span class="hex-icon" aria-hidden="true">${info.icon}</span>${state.showYields && terrain !== 'coast' ? `<span class="hex-label">${tileLabel(terrain, x, y)}</span>` : ''}`;
      tile.addEventListener('click', () => handleTileClick(x, y));
      fragment.append(tile);
    }
  }
  mapGrid.append(fragment);
}

function renderUnits() {
  const list = $('miniUnitList');
  $('unitCount').textContent = state.units.length;
  list.replaceChildren();
  state.units.forEach((unit) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mini-unit${state.selectedUnit === unit.id ? ' selected' : ''}`;
    button.innerHTML = `<span class="mini-unit-icon">${unit.symbol}</span><span class="mini-unit-copy"><strong>${unit.name}</strong><small>${unit.x + 1}-${unit.y + 1} · ${unit.movement}/${unit.maxMovement} 移动力</small></span><span class="mini-unit-status">${unit.status}</span>`;
    button.addEventListener('click', () => selectUnit(unit.id));
    list.append(button);
  });
}

function renderResources() {
  $('foodValue').textContent = `+${state.food}`;
  $('scienceValue').textContent = `+${state.science}`;
  $('cultureValue').textContent = `+${state.culture}`;
  $('goldValue').textContent = state.gold;
  $('eraLabel').textContent = `古典时代 · 第 ${state.turn} 回合`;
  $('turnLabel').textContent = `${state.turn} / 100`;
  $('turnProgress').style.width = `${Math.min(100, state.turn)}%`;
}

function renderInspector() {
  const selectedUnit = getSelectedUnit();
  let x = 4; let y = 3;
  if (state.selected.type === 'unit' && selectedUnit) { x = selectedUnit.x; y = selectedUnit.y; }
  if (state.selected.type === 'tile' || state.selected.type === 'city') [x, y] = state.selected.key.split('-').map(Number);
  const terrain = getTile(x, y) || 'plains';
  const info = terrainInfo[terrain];
  const city = getCityAt(x, y);
  $('inspectorTitle').textContent = city?.name || (selectedUnit?.name || info.label);
  $('heroTitle').textContent = city ? `${city.name} · 城市中心` : info.label;
  $('heroSubtitle').textContent = city ? `人口 ${city.population} · 新汉` : info.subtitle;
  $('heroSymbol').textContent = city ? '✦' : info.icon;
  $('terrainBadge').textContent = info.label;
  $('terrainCopy').textContent = city ? '长安坐落在河谷的淡水边缘。这里是新汉文明的首都，也是探索东方世界的起点。' : info.copy;
  $('featureTags').innerHTML = (city ? ['首都', '淡水', '忠诚 100'] : info.tags).map((tag) => `<span>${tag}</span>`).join('');
  const values = city ? [5, 3, 8] : info.yields;
  $('yieldGrid').innerHTML = [['✦', values[0], '粮食', 'food'], ['▰', values[1], '生产力', 'production'], ['◈', values[2], '金币', 'gold']].map(([symbol, value, label, cls]) => `<div><span class="yield-symbol ${cls}">${symbol}</span><strong>${value}</strong><small>${label}</small></div>`).join('');
  $('cityInspector').hidden = !city;
  $('selectionType').textContent = selectedUnit ? '已选单位' : city ? '已选城市' : '地块详情';
  $('selectionName').textContent = selectedUnit ? selectedUnit.name : city ? city.name : info.label;
  $('selectionDescription').textContent = selectedUnit ? `${selectedUnit.status} · ${selectedUnit.movement}/${selectedUnit.maxMovement} 移动力 · 坐标 ${x + 1}-${y + 1}` : city ? '首都正在建造纪念碑，点击“管理”查看城市详情。' : info.copy;
  $('selectionStatus').textContent = selectedUnit ? `已选择 ${selectedUnit.name} · 点击高亮地块移动` : `已查看 ${city?.name || info.label}`;
  $('selectionArt').textContent = selectedUnit ? selectedUnit.symbol : city ? '✦' : info.icon;
  renderActions(selectedUnit, city);
}

function renderActions(unit, city) {
  const buttons = $('actionButtons');
  buttons.replaceChildren();
  if (unit) {
    const move = actionButton('⌖ 移动', 'primary', () => { state.movementMode = !state.movementMode; showToast(state.movementMode ? '请选择一个金色高亮地块。' : '已取消移动。'); renderAll(); });
    const fortify = actionButton('▣ 待命', '', () => { unit.status = '待命'; unit.movement = 0; state.movementMode = false; addLog(`${unit.name} 已待命。`); renderAll(); });
    buttons.append(move, fortify);
    if (unit.type === 'settler') buttons.append(actionButton('＋ 建立城市', '', () => settleCity(unit)));
  } else if (city) {
    buttons.append(actionButton('⌂ 管理城市', 'primary', () => showToast('城市面板已打开：长安正在建造纪念碑。')));
    buttons.append(actionButton('▤ 生产列表', '', () => showToast('生产列表：纪念碑 · 还需 3 回合。')));
  } else {
    buttons.append(actionButton('⌖ 探索地图', 'primary', () => selectUnit('scout-1')));
    buttons.append(actionButton('▣ 待命', '', () => showToast('先选择一个单位，再执行待命。')));
    buttons.append(actionButton('＋ 建造', '', () => showToast('选择长安后可以管理城市生产。')));
  }
}

function actionButton(label, variant, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `action-button${variant ? ` ${variant}` : ''}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function handleTileClick(x, y) {
  const unit = getUnitAt(x, y);
  const city = getCityAt(x, y);
  const selectedUnit = getSelectedUnit();
  if (state.movementMode && selectedUnit && tileIsMoveTarget(x, y)) {
    moveUnit(selectedUnit, x, y);
    return;
  }
  if (unit) { selectUnit(unit.id); return; }
  state.movementMode = false;
  state.selectedUnit = null;
  state.selected = { type: city ? 'city' : 'tile', key: key(x, y) };
  renderAll();
}

function selectUnit(unitId) {
  const unit = state.units.find((item) => item.id === unitId);
  if (!unit) return;
  state.selectedUnit = unit.id;
  state.selected = { type: 'unit', key: key(unit.x, unit.y) };
  state.movementMode = false;
  renderAll();
}

function moveUnit(unit, x, y) {
  unit.x = x; unit.y = y; unit.movement = Math.max(0, unit.movement - 1); unit.status = unit.movement ? '探索中' : '已移动';
  state.selected = { type: 'unit', key: key(x, y) };
  state.movementMode = false;
  addLog(`${unit.name} 移动到 ${terrainInfo[getTile(x, y)].label}。`);
  showToast(`${unit.name} 已移动。`);
  renderAll();
}

function settleCity(unit) {
  if (unit.type !== 'settler') return;
  const existingCity = getCityAt(unit.x, unit.y);
  if (existingCity) { showToast('这里已经有一座城市。'); return; }
  const name = state.cities.length ? '洛阳' : '长安';
  state.cities.push({ id: `city-${Date.now()}`, name, x: unit.x, y: unit.y, population: 1 });
  state.units = state.units.filter((item) => item.id !== unit.id);
  state.selectedUnit = null;
  state.selected = { type: 'city', key: key(unit.x, unit.y) };
  addLog(`${name} 建立了！新城市加入新汉。`);
  showToast(`${name} 已建立。`);
  renderAll();
}

function endTurn() {
  state.turn += 1;
  state.year += 1;
  state.gold += 8;
  state.food += 1;
  state.science += 1;
  state.culture += 1;
  state.units.forEach((unit) => { unit.movement = unit.maxMovement; if (unit.status !== '待命') unit.status = '探索中'; });
  state.movementMode = false;
  addLog(`第 ${state.turn} 回合开始。城市产出已结算。`);
  showToast(`第 ${state.turn} 回合 · 公元前 ${Math.abs(state.year)} 年`);
  renderAll();
}

function addLog(message) {
  state.logs.unshift(message);
  state.logs = state.logs.slice(0, 5);
  $('saveStamp').textContent = '刚刚';
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast'; toast.textContent = message;
  $('toastRegion').append(toast);
  window.setTimeout(() => { toast.classList.add('out'); window.setTimeout(() => toast.remove(), 250); }, 2800);
}

function renderTechTree() {
  $('techTree').innerHTML = techs.map((tech) => `<button class="tech-card ${tech.state}" data-tech="${tech.id}" type="button"><span class="tech-state">${tech.state === 'done' ? '已完成' : tech.state === 'locked' ? '未解锁' : `${tech.turns} 回合`}</span><h3>${tech.name}</h3><p>${tech.description}</p></button>`).join('');
  $('techTree').querySelectorAll('.tech-card.available').forEach((card) => card.addEventListener('click', () => { const tech = techs.find((item) => item.id === card.dataset.tech); showToast(`已选择研究：${tech.name}，预计 ${tech.turns} 回合。`); $('techModal').close(); }));
}

function renderAll() {
  renderMap(); renderUnits(); renderResources(); renderInspector();
  $('yieldToggle').classList.toggle('active', state.showYields);
  $('gridToggle').classList.toggle('active', state.showGrid);
}

function bindEvents() {
  $('endTurnButton').addEventListener('click', endTurn);
  $('yieldToggle').addEventListener('click', () => { state.showYields = !state.showYields; renderAll(); });
  $('gridToggle').addEventListener('click', () => { state.showGrid = !state.showGrid; renderAll(); });
  $('zoomButton').addEventListener('click', () => { mapGrid.classList.toggle('zoomed'); showToast('地图缩放已切换。'); });
  $('soundToggle').addEventListener('click', () => { state.sound = !state.sound; $('soundToggle').textContent = state.sound ? '◒' : '◌'; showToast(state.sound ? '音效已开启。' : '音效已静音。'); });
  $('helpButton').addEventListener('click', () => $('helpModal').showModal());
  $('techTreeButton').addEventListener('click', () => { renderTechTree(); $('techModal').showModal(); });
  $('capitalButton').addEventListener('click', () => { state.selectedUnit = null; state.movementMode = false; state.selected = { type: 'city', key: '4-3' }; renderAll(); });
  $('settleHintButton').addEventListener('click', () => { const settler = state.units.find((unit) => unit.type === 'settler'); if (settler) selectUnit(settler.id); else showToast('当前没有可用的开拓者。'); });
  $('cityManageButton').addEventListener('click', () => showToast('长安：纪念碑还需 3 回合，人口增长稳定。'));
  $('closeInspector').addEventListener('click', () => { state.selectedUnit = null; state.selected = { type: 'tile', key: '4-3' }; renderAll(); });
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  document.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter' && event.target === document.body) { event.preventDefault(); endTurn(); }
    if (event.key.toLowerCase() === 'f' && getSelectedUnit()) { getSelectedUnit().status = '待命'; getSelectedUnit().movement = 0; state.movementMode = false; renderAll(); showToast('单位已待命。'); }
    if (event.key === 'Escape') document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  });
}

const heroSymbol = document.createElement('span');
heroSymbol.id = 'heroSymbol';
document.querySelector('.hero-symbol')?.replaceWith(heroSymbol);
bindEvents();
renderAll();
