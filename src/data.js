// 静态数据：地形、资源、单位、建筑、科技、市政

export const TERRAINS = {
  ocean:    { name: '海洋', color: '#173b5e', food: 1, prod: 0, gold: 1, passable: false, naval: true, moveCost: 1 },
  coast:    { name: '海岸', color: '#2c6390', food: 1, prod: 0, gold: 2, passable: false, naval: true, moveCost: 1 },
  grass:    { name: '草原', color: '#5a8c3a', food: 2, prod: 0, gold: 0, passable: true, moveCost: 1 },
  plain:    { name: '平原', color: '#a89545', food: 1, prod: 1, gold: 0, passable: true, moveCost: 1 },
  forest:   { name: '森林', color: '#3a6b2e', food: 1, prod: 2, gold: 0, passable: true, moveCost: 2 },
  jungle:   { name: '雨林', color: '#266a4a', food: 1, prod: 1, sci: 1, passable: true, moveCost: 2 },
  hill:     { name: '丘陵', color: '#7a6a3a', food: 1, prod: 2, gold: 0, passable: true, moveCost: 2 },
  mountain: { name: '山脉', color: '#5a5a5a', food: 0, prod: 0, gold: 0, passable: false, moveCost: 99 },
  desert:   { name: '沙漠', color: '#c8b06a', food: 0, prod: 0, gold: 0, passable: true, moveCost: 1 },
  tundra:   { name: '苔原', color: '#7a8a7a', food: 1, prod: 0, gold: 0, passable: true, moveCost: 1 },
  snow:     { name: '雪原', color: '#cfd6d8', food: 0, prod: 0, gold: 0, passable: true, moveCost: 1 },
};

export const RESOURCES = {
  wheat:   { name: '小麦',   icon: '🌾', terrain: ['grass','plain'],     yield: { food: 2 } },
  cattle:  { name: '牛',     icon: '🐄', terrain: ['grass','plain'],     yield: { food: 1, prod: 1 } },
  fish:    { name: '鱼',     icon: '🐟', terrain: ['coast'],             yield: { food: 2 } },
  deer:    { name: '鹿',     icon: '🦌', terrain: ['forest','tundra'],   yield: { food: 1, prod: 1 } },
  iron:    { name: '铁',     icon: '⛓️',  terrain: ['hill','plain'],      yield: { prod: 2 }, strategic: true },
  horse:   { name: '马',     icon: '🐎', terrain: ['grass','plain'],     yield: { prod: 1, food: 1 }, strategic: true },
  gold_r:  { name: '黄金',   icon: '🪙', terrain: ['hill','desert'],     yield: { gold: 3 } },
  gems:    { name: '宝石',   icon: '💎', terrain: ['jungle','hill'],     yield: { gold: 2 } },
  stone:   { name: '石材',   icon: '🪨', terrain: ['hill','plain'],      yield: { prod: 1 } },
  wine:    { name: '葡萄酒', icon: '🍇', terrain: ['grass','plain'],     yield: { gold: 1, food: 1 } },
};

export const UNITS = {
  settler:  { name: '开拓者', icon: '🏕️', cost: 60, type: 'civilian', moves: 2, hp: 0,   atk: 0,  def: 0,  sight: 2, ability: 'found', maint: 0, tech: null },
  worker:   { name: '工人',   icon: '⚒️', cost: 40, type: 'civilian', moves: 2, hp: 0,   atk: 0,  def: 0,  sight: 2, ability: 'build', maint: 0, charges: 3, tech: null },
  scout:    { name: '侦察兵', icon: '🥾', cost: 25, type: 'military', moves: 3, hp: 50,  atk: 10, def: 8,  sight: 3, maint: 0, tech: null },
  warrior:  { name: '勇士',   icon: '🛡️', cost: 40, type: 'military', moves: 2, hp: 50,  atk: 20, def: 18, sight: 2, maint: 1, tech: null },
  archer:   { name: '弓箭手', icon: '🏹', cost: 60, type: 'military', moves: 2, hp: 50,  atk: 25, def: 15, sight: 2, ranged: true, range: 2, maint: 1, tech: 'archery' },
  spear:    { name: '长矛兵', icon: '🔱', cost: 60, type: 'military', moves: 2, hp: 50,  atk: 25, def: 22, sight: 2, maint: 1, tech: 'bronze_working' },
  horseman: { name: '骑兵',   icon: '🐎', cost: 90, type: 'military', moves: 4, hp: 60,  atk: 35, def: 25, sight: 3, maint: 2, tech: 'horseback' },
  swords:   { name: '剑士',   icon: '⚔️', cost: 100,type: 'military', moves: 2, hp: 60,  atk: 36, def: 30, sight: 2, maint: 2, tech: 'iron_working' },
  catapult: { name: '投石车', icon: '🧨', cost: 120,type: 'military', moves: 2, hp: 50,  atk: 35, def: 18, sight: 2, ranged: true, range: 2, siege: true, maint: 2, tech: 'mathematics' },
  knight:   { name: '骑士',   icon: '🐴', cost: 180,type: 'military', moves: 4, hp: 70,  atk: 50, def: 38, sight: 3, maint: 3, tech: 'chivalry' },
  musketeer:{ name: '火枪手', icon: '🔫', cost: 240,type: 'military', moves: 2, hp: 80,  atk: 60, def: 55, sight: 2, maint: 3, tech: 'gunpowder' },
};

export const BUILDINGS = {
  monument:   { name: '纪念碑',   cost: 60,  maint: 0, yield: { cult: 2 }, tech: null },
  granary:    { name: '粮仓',     cost: 65,  maint: 0, yield: { food: 2 }, tech: 'pottery' },
  library:    { name: '图书馆',   cost: 90,  maint: 1, yield: { sci: 3 },  tech: 'writing' },
  barracks:   { name: '兵营',     cost: 90,  maint: 1, yield: { prod: 1 }, defense: 4, tech: 'bronze_working' },
  walls:      { name: '城墙',     cost: 80,  maint: 0, defense: 8,         tech: 'masonry' },
  market:     { name: '集市',     cost: 100, maint: 0, yield: { gold: 3 }, tech: 'currency' },
  temple:     { name: '神庙',     cost: 80,  maint: 1, yield: { cult: 2, faith: 2 }, tech: null },
  workshop:   { name: '工坊',     cost: 110, maint: 1, yield: { prod: 2 }, tech: 'mathematics' },
  university: { name: '大学',     cost: 200, maint: 2, yield: { sci: 4 },  tech: 'education' },
  bank:       { name: '银行',     cost: 180, maint: 1, yield: { gold: 4 }, tech: 'banking' },
};

// 科技树
export const TECHS = {
  pottery:        { name: '陶器',       cost: 25,  era: 'ancient',   prereq: [],                            unlocks: ['粮仓'] },
  animal:         { name: '畜牧',       cost: 25,  era: 'ancient',   prereq: [],                            unlocks: ['提升:牧场'] },
  mining:         { name: '采矿',       cost: 25,  era: 'ancient',   prereq: [],                            unlocks: ['提升:矿场'] },
  masonry:        { name: '石工',       cost: 40,  era: 'ancient',   prereq: ['mining'],                    unlocks: ['城墙'] },
  archery:        { name: '弓术',       cost: 35,  era: 'ancient',   prereq: [],                            unlocks: ['弓箭手'] },
  bronze_working: { name: '青铜冶炼',   cost: 55,  era: 'ancient',   prereq: ['mining'],                    unlocks: ['长矛兵','兵营'] },
  writing:        { name: '书写',       cost: 55,  era: 'ancient',   prereq: ['pottery'],                   unlocks: ['图书馆'] },
  horseback:      { name: '驯马',       cost: 90,  era: 'classical', prereq: ['animal'],                    unlocks: ['骑兵'] },
  currency:       { name: '货币',       cost: 105, era: 'classical', prereq: ['writing'],                   unlocks: ['集市'] },
  iron_working:   { name: '冶铁',       cost: 130, era: 'classical', prereq: ['bronze_working'],            unlocks: ['剑士'] },
  mathematics:    { name: '数学',       cost: 140, era: 'classical', prereq: ['currency'],                  unlocks: ['工坊','投石车'] },
  education:      { name: '教育',       cost: 220, era: 'medieval',  prereq: ['mathematics','writing'],     unlocks: ['大学'] },
  chivalry:       { name: '骑士道',     cost: 240, era: 'medieval',  prereq: ['horseback','iron_working'],  unlocks: ['骑士'] },
  banking:        { name: '银行学',     cost: 320, era: 'medieval',  prereq: ['currency','education'],      unlocks: ['银行'] },
  gunpowder:      { name: '火药',       cost: 420, era: 'renaissance', prereq: ['chivalry'],                unlocks: ['火枪手'] },
  industrial:     { name: '工业化',     cost: 600, era: 'industrial', prereq: ['banking','gunpowder'],      unlocks: ['科技胜利接近'] },
  flight:         { name: '飞行',       cost: 900, era: 'modern',     prereq: ['industrial'],               unlocks: ['进入现代'] },
  space_flight:   { name: '太空飞行',   cost:1400, era: 'atomic',     prereq: ['flight'],                   unlocks: ['科技胜利!'] },
};

// 市政树
export const CIVICS = {
  code_law:    { name: '法典',       cost: 40,  prereq: [],                       grants: { polSlots: 1 } },
  craftsman:   { name: '工艺',       cost: 40,  prereq: [],                       grants: { prodCity: 1 } },
  early_empire:{ name: '早期帝国',   cost: 80,  prereq: ['code_law'],             grants: { cityCap: 2 } },
  mysticism:   { name: '神秘主义',   cost: 80,  prereq: ['craftsman'],            grants: { faithCity: 1 } },
  state_workforce:{name: '国家劳役', cost: 130, prereq: ['craftsman'],            grants: { prodCity: 2 } },
  political:   { name: '政治哲学',   cost: 200, prereq: ['early_empire'],         grants: { polSlots: 2 } },
  recorded:    { name: '史书',       cost: 200, prereq: ['mysticism'],            grants: { cultCity: 2 } },
  feudalism:   { name: '封建主义',   cost: 300, prereq: ['political','state_workforce'], grants: { unitMaintDown: 1 } },
  guilds:      { name: '行会',       cost: 400, prereq: ['feudalism'],            grants: { goldCity: 2 } },
  exploration: { name: '大航海',     cost: 500, prereq: ['guilds'],               grants: { sightUp: 1 } },
  enlightenment:{name: '启蒙运动',   cost: 700, prereq: ['exploration','recorded'], grants: { sciCity: 2 } },
  nationalism: { name: '民族主义',   cost: 900, prereq: ['enlightenment'],        grants: { combatUp: 5 } },
  globalization:{name: '全球化',     cost: 1400,prereq: ['nationalism'],          grants: { cultVictoryClose: true } },
};

// 文明（玩家可选 + AI）
export const CIVS = [
  { id: 'china',  name: '中国',     leader: '秦始皇',  color: '#d63a2a', bias: 'wonder' },
  { id: 'rome',   name: '罗马',     leader: '凯撒',    color: '#9c2b2b', bias: 'expand' },
  { id: 'egypt',  name: '埃及',     leader: '克利奥帕特拉', color: '#e9b243', bias: 'wonder' },
  { id: 'greece', name: '希腊',     leader: '伯利克里', color: '#3a6dcc', bias: 'culture' },
  { id: 'persia', name: '波斯',     leader: '居鲁士',  color: '#a14fb5', bias: 'expand' },
  { id: 'mongol', name: '蒙古',     leader: '成吉思汗', color: '#5d5d5d', bias: 'war' },
  { id: 'japan',  name: '日本',     leader: '北条时宗', color: '#f0f0f0', bias: 'science' },
  { id: 'india',  name: '印度',     leader: '阿育王',  color: '#3aa66c', bias: 'culture' },
];

export const ERAS = ['ancient','classical','medieval','renaissance','industrial','modern','atomic'];

// 工人改良
export const IMPROVEMENTS = {
  farm:    { name: '农场', terrain: ['grass','plain'],            yield: { food: 1 } },
  mine:    { name: '矿场', terrain: ['hill'],                     yield: { prod: 2 } },
  pasture: { name: '牧场', terrain: ['grass','plain'],            yield: { prod: 1 }, needsRes: ['cattle','horse'] },
  camp:    { name: '营地', terrain: ['forest','tundra'],          yield: { gold: 1, prod: 1 }, needsRes: ['deer'] },
  quarry:  { name: '采石场', terrain: ['hill','plain'],           yield: { prod: 1 }, needsRes: ['stone'] },
  fishing: { name: '渔船', terrain: ['coast'],                    yield: { food: 1 }, needsRes: ['fish'] },
  trading_post:{name:'商站', terrain: ['grass','plain','desert'], yield: { gold: 1 } },
};
