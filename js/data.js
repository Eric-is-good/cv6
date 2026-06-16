// ===== 游戏数据：地形、地貌、资源、单位、建筑、科技 =====
// 产出格式：[食物, 产能, 金币, 科技, 文化]
var Data = (function () {
  'use strict';

  // ---- 地形 ----
  var TERRAIN = {
    ocean:    { name: '海洋', yield: [1, 0, 1, 0, 0], color: '#1b3f6b', water: true, pass: false },
    coast:    { name: '海岸', yield: [1, 0, 1, 0, 0], color: '#2d5a8a', water: true, pass: false },
    grassland:{ name: '草原', yield: [2, 0, 0, 0, 0], color: '#7caf4f', water: false, pass: true },
    plains:   { name: '平原', yield: [1, 1, 0, 0, 0], color: '#bda35a', water: false, pass: true },
    desert:   { name: '沙漠', yield: [0, 0, 0, 0, 0], color: '#e0cf8d', water: false, pass: true },
    tundra:   { name: '冻土', yield: [1, 0, 0, 0, 0], color: '#a8b39a', water: false, pass: true },
    snow:     { name: '雪原', yield: [0, 0, 0, 0, 0], color: '#dfe6ea', water: false, pass: true },
    mountain: { name: '山脉', yield: [0, 0, 0, 0, 0], color: '#6b6f76', water: false, pass: false }
  };

  // ---- 地貌 ----
  var FEATURE = {
    forest:    { name: '森林', dYield: [0, 1, 0, 0, 0], moveCost: 2, defense: 3, block: true },
    rainforest:{ name: '雨林', dYield: [1, 0, 0, 0, 0], moveCost: 2, defense: 3, block: true },
    marsh:     { name: '沼泽', dYield: [1, 0, 0, 0, 0], moveCost: 3, defense: -2, block: false },
    oasis:     { name: '绿洲', dYield: [3, 0, 1, 0, 0], moveCost: 1, defense: 0, block: false },
    floodplains:{ name: '泛滥平原', dYield: [1, 0, 0, 0, 0], moveCost: 1, defense: -2, block: false }
  };

  // ---- 资源 ----
  // type: bonus 加成 / strategic 战略 / luxury 奢侈
  var RESOURCE = {
    wheat:  { name: '小麦', type: 'bonus', dYield: [1, 0, 0, 0, 0], terrains: ['plains', 'grassland', 'floodplains'], improve: 'farm' },
    rice:   { name: '稻米', type: 'bonus', dYield: [1, 0, 0, 0, 0], terrains: ['grassland'], improve: 'farm' },
    cattle: { name: '牛',   type: 'bonus', dYield: [1, 0, 0, 0, 0], terrains: ['grassland'], improve: 'pasture' },
    stone:  { name: '石料', type: 'bonus', dYield: [0, 1, 0, 0, 0], terrains: ['grassland', 'plains'], improve: 'quarry' },
    fish:   { name: '鱼',   type: 'bonus', dYield: [1, 0, 0, 0, 0], terrains: ['coast'], improve: 'fishing' },
    copper: { name: '铜',   type: 'bonus', dYield: [0, 0, 2, 0, 0], terrains: ['grassland', 'plains', 'desert'], improve: 'mine' },
    horses: { name: '马',   type: 'strategic', dYield: [0, 1, 0, 0, 0], terrains: ['plains', 'grassland'], improve: 'pasture', reveal: 'animal_husbandry' },
    iron:   { name: '铁',   type: 'strategic', dYield: [0, 1, 0, 0, 0], terrains: ['grassland', 'plains', 'hills'], improve: 'mine', reveal: 'mining' },
    niter:  { name: '硝石', type: 'strategic', dYield: [0, 1, 0, 0, 0], terrains: ['plains', 'desert', 'tundra', 'hills'], improve: 'mine', reveal: 'military_engineering' },
    spices: { name: '香料', type: 'luxury', dYield: [0, 0, 2, 0, 0], terrains: ['rainforest'], improve: 'plantation' },
    silk:   { name: '丝绸', type: 'luxury', dYield: [0, 0, 2, 0, 0], terrains: ['forest'], improve: 'plantation' },
    gems:   { name: '宝石', type: 'luxury', dYield: [0, 0, 2, 0, 0], terrains: ['grassland', 'hills'], improve: 'mine' }
  };

  // ---- 地块改良 ----
  var MINE_RES = { copper: 1, iron: 1, gems: 1, niter: 1 };
  var FARMABLE = { grassland: 1, plains: 1, floodplains: 1 };

  var IMPROVE = {
    farm:       { name: '农场', dYield: [1, 0, 0, 0, 0], tech: 'pottery',
                  valid: function (t) { return !t.water && !t.feature && !t.hills && t.terrain !== 'mountain' && FARMABLE[t.terrain]; } },
    mine:       { name: '矿山', dYield: [0, 1, 0, 0, 0], tech: 'mining',
                  valid: function (t) { return !t.water && t.terrain !== 'mountain' && (t.hills || MINE_RES[t.resource]); } },
    pasture:    { name: '牧场', dYield: [0, 1, 0, 0, 0], tech: 'animal_husbandry',
                  valid: function (t) { return !t.water && (t.resource === 'horses' || t.resource === 'cattle'); } },
    quarry:     { name: '采石场', dYield: [0, 1, 0, 0, 0], tech: 'mining',
                  valid: function (t) { return !t.water && t.resource === 'stone'; } },
    plantation: { name: '种植园', dYield: [0, 0, 1, 0, 0], tech: 'celestial_navigation',
                  valid: function (t) { return !t.water && (t.resource === 'spices' || t.resource === 'silk'); } },
    fishing:    { name: '渔船', dYield: [1, 0, 1, 0, 0], tech: 'sailing',
                  valid: function (t) { return t.water && t.resource === 'fish'; } }
  };

  function isFlat(t) { return !t.hills && t.terrain !== 'mountain' && !t.water; }

  // ---- 单位 ----
  // kind: settler / builder / melee / ranged / scout / cav / siege / naval / naval_ranged
  var UNIT = {
    settler:   { name: '开拓者', glyph: '拓', cost: 80, moves: 2, kind: 'settler', str: 0, maint: 0 },
    builder:   { name: '建造者', glyph: '建', cost: 50, moves: 2, kind: 'builder', str: 0, charges: 3, maint: 0 },
    warrior:   { name: '战士', glyph: '战', cost: 40, moves: 2, kind: 'melee', str: 20, range: 0, maint: 1, tech: null },
    slinger:   { name: '投石兵', glyph: '投', cost: 35, moves: 2, kind: 'ranged', str: 15, def: 10, range: 1, maint: 1, tech: null },
    scout:     { name: '侦察兵', glyph: '斥', cost: 30, moves: 3, kind: 'scout', str: 10, range: 0, maint: 1, tech: null },
    archer:    { name: '弓箭手', glyph: '弓', cost: 60, moves: 2, kind: 'ranged', str: 25, def: 15, range: 2, maint: 1, tech: 'archery' },
    spearman:  { name: '矛兵', glyph: '矛', cost: 50, moves: 2, kind: 'melee', str: 25, bonusVsCav: 10, range: 0, maint: 1, tech: 'bronze_working' },
    horseman:  { name: '骑兵', glyph: '骑', cost: 80, moves: 4, kind: 'cav', str: 22, range: 0, maint: 2, tech: 'horseback_riding', res: 'horses' },
    swordsman: { name: '剑士', glyph: '剑', cost: 90, moves: 2, kind: 'melee', str: 30, range: 0, maint: 2, tech: 'iron_working', res: 'iron' },
    catapult:  { name: '投石车', glyph: '炮', cost: 120, moves: 2, kind: 'siege', str: 35, def: 15, range: 2, maint: 2, tech: 'mathematics', res: 'iron', bonusVsCity: 1 },
    pikeman:   { name: '长矛兵', glyph: '槊', cost: 160, moves: 2, kind: 'melee', str: 35, bonusVsCav: 17, range: 0, maint: 2, tech: 'military_tactics' },
    galley:    { name: '桨帆战船', glyph: '船', cost: 65, moves: 3, kind: 'naval', str: 20, range: 0, maint: 1, tech: 'sailing' },
    quadrireme:{ name: '四列战船', glyph: '舰', cost: 100, moves: 3, kind: 'naval_ranged', str: 25, def: 15, range: 1, maint: 2, tech: 'shipbuilding' },
    // 蛮族
    barb_warrior:  { name: '蛮族战士', glyph: '蛮', cost: 0, moves: 2, kind: 'melee', str: 18, range: 0, maint: 0 },
    barb_archer:   { name: '蛮族弓手', glyph: '蛮', cost: 0, moves: 2, kind: 'ranged', str: 15, def: 10, range: 1, maint: 0 }
  };

  // ---- 建筑 ----
  var BUILDING = {
    palace:       { name: '宫殿', cost: 0, yield: [2, 1, 2, 2, 1], housing: 0, unique: true, tech: null },
    monument:     { name: '纪念碑', cost: 60, yield: [0, 0, 0, 0, 2], housing: 0, tech: null },
    granary:      { name: '粮仓', cost: 80, yield: [2, 0, 0, 0, 0], housing: 2, tech: 'pottery' },
    library:      { name: '图书馆', cost: 80, yield: [0, 0, 0, 2, 0], housing: 0, tech: 'writing' },
    market:       { name: '市场', cost: 100, yield: [0, 0, 3, 0, 0], housing: 0, tech: 'currency' },
    barracks:     { name: '兵营', cost: 70, yield: [0, 1, 0, 0, 0], housing: 0, tech: 'bronze_working' },
    walls:        { name: '城墙', cost: 90, yield: [0, 0, 0, 0, 0], housing: 0, tech: 'masonry', defense: 200, defStr: 5 },
    stable:       { name: '马厩', cost: 90, yield: [0, 1, 0, 0, 0], housing: 0, tech: 'horseback_riding' },
    harbor:       { name: '港口', cost: 80, yield: [1, 0, 1, 0, 0], housing: 0, tech: 'sailing' },
    workshop:     { name: '工坊', cost: 120, yield: [0, 2, 0, 0, 0], housing: 0, tech: 'apprenticeship' },
    university:   { name: '大学', cost: 150, yield: [0, 0, 0, 4, 0], housing: 0, tech: 'education' },
    amphitheater: { name: '剧场', cost: 120, yield: [0, 0, 0, 0, 3], housing: 0, tech: 'drama' },
    bank:         { name: '银行', cost: 180, yield: [0, 0, 4, 0, 0], housing: 0, tech: 'banking' },
    aqueduct:     { name: '引水渠', cost: 100, yield: [0, 0, 0, 0, 0], housing: 2, tech: 'engineering' },
    factory:      { name: '工厂', cost: 280, yield: [0, 3, 0, 0, 0], housing: 0, tech: 'industrialization' }
  };

  // ---- 科技树 ----
  // era: ancient/classical/medieval/renaissance/industrial
  var TECH = {
    // 古代
    pottery:            { name: '制陶', cost: 25, era: 'ancient', req: [], unlocks: ['粮仓'] },
    animal_husbandry:   { name: '畜牧', cost: 25, era: 'ancient', req: [], unlocks: ['牧场'], reveal: 'horses' },
    mining:             { name: '采矿', cost: 25, era: 'ancient', req: [], unlocks: ['矿山', '采石场'], reveal: 'copper' },
    writing:            { name: '文字', cost: 40, era: 'ancient', req: [], unlocks: ['图书馆'] },
    // 古典
    masonry:            { name: '砌砖', cost: 40, era: 'classical', req: ['mining'], unlocks: ['城墙'] },
    astrology:          { name: '占星', cost: 50, era: 'classical', req: ['pottery'], unlocks: [] },
    bronze_working:     { name: '青铜器', cost: 50, era: 'classical', req: ['mining'], unlocks: ['兵营', '矛兵'] },
    the_wheel:          { name: '轮子', cost: 45, era: 'classical', req: ['mining'], unlocks: [] },
    archery:            { name: '射箭', cost: 45, era: 'classical', req: ['animal_husbandry'], unlocks: ['弓箭手'] },
    sailing:            { name: '航海', cost: 50, era: 'classical', req: ['pottery'], unlocks: ['港口', '桨帆战船', '渔船'] },
    horseback_riding:   { name: '骑术', cost: 70, era: 'classical', req: ['the_wheel'], unlocks: ['骑兵', '马厩'] },
    iron_working:       { name: '铁器', cost: 90, era: 'classical', req: ['bronze_working'], unlocks: ['剑士'], reveal: 'iron' },
    mathematics:        { name: '数学', cost: 80, era: 'classical', req: ['writing'], unlocks: ['投石车'] },
    currency:           { name: '货币', cost: 70, era: 'classical', req: ['writing'], unlocks: ['市场'] },
    // 中世纪
    celestial_navigation:{ name: '天体导航', cost: 70, era: 'medieval', req: ['sailing', 'astrology'], unlocks: ['种植园'] },
    construction:       { name: '建筑学', cost: 110, era: 'medieval', req: ['masonry', 'the_wheel'], unlocks: [] },
    engineering:        { name: '工程学', cost: 110, era: 'medieval', req: ['masonry', 'the_wheel'], unlocks: ['引水渠'] },
    shipbuilding:       { name: '造船', cost: 120, era: 'medieval', req: ['sailing'], unlocks: ['四列战船'] },
    apprenticeship:     { name: '学徒制', cost: 140, era: 'medieval', req: ['currency', 'construction'], unlocks: ['工坊'] },
    feudalism:          { name: '封建主义', cost: 140, era: 'medieval', req: ['horseback_riding', 'currency'], unlocks: [] },
    military_tactics:   { name: '军事战术', cost: 160, era: 'medieval', req: ['horseback_riding', 'iron_working'], unlocks: ['长矛兵'] },
    drama:              { name: '戏剧与诗歌', cost: 130, era: 'medieval', req: ['writing'], unlocks: ['剧场'] },
    // 文艺复兴
    education:          { name: '教育', cost: 180, era: 'renaissance', req: ['apprenticeship'], unlocks: ['大学'] },
    military_engineering:{ name: '军事工程', cost: 200, era: 'renaissance', req: ['military_tactics', 'engineering'], unlocks: [], reveal: 'niter' },
    banking:            { name: '银行业', cost: 220, era: 'renaissance', req: ['currency', 'education'], unlocks: ['银行'] },
    gunpowder:          { name: '火药', cost: 240, era: 'renaissance', req: ['military_engineering'], unlocks: [] },
    printing:           { name: '印刷术', cost: 240, era: 'renaissance', req: ['education'], unlocks: [] },
    // 工业
    industrialization:  { name: '工业化', cost: 360, era: 'industrial', req: ['banking', 'printing'], unlocks: ['工厂'] },
    scientific_theory:  { name: '科学理论', cost: 540, era: 'industrial', req: ['industrialization', 'scientific_theory_x'], unlocks: [] },
    ballistics:         { name: '弹道学', cost: 600, era: 'industrial', req: ['gunpowder', 'military_engineering'], unlocks: [] },
    electricity:        { name: '电力', cost: 700, era: 'industrial', req: ['industrialization', 'scientific_theory_x'], unlocks: [] }
  };
  // 修复科技树中占位依赖
  TECH.scientific_theory.req = ['industrialization'];
  TECH.electricity.req = ['industrialization'];

  var ERA_NAME = {
    ancient: '古代', classical: '古典', medieval: '中世纪',
    renaissance: '文艺复兴', industrial: '工业时代'
  };

  // ---- 难度 ----
  var DIFFICULTY = {
    easy:   { name: '开拓者', aiBonus: 0.7, barbRate: 1.0 },
    normal: { name: '酋长', aiBonus: 1.0, barbRate: 1.2 },
    hard:   { name: '王子', aiBonus: 1.3, barbRate: 1.5 }
  };

  // ---- 可选 AI 文明 ----
  var AI_CIVS = [
    { name: '罗马', leader: '图拉真', color: '#c0392b' },
    { name: '希腊', leader: '伯里克利', color: '#3a7bd5' },
    { name: '埃及', leader: '克里奥帕特拉', color: '#e6b800' },
    { name: '日本', leader: '北条时宗', color: '#d64545' },
    { name: '印度', leader: '甘地', color: '#9b59b6' },
    { name: '俄罗斯', leader: '彼得', color: '#5dade2' }
  ];

  return {
    TERRAIN: TERRAIN, FEATURE: FEATURE, RESOURCE: RESOURCE, IMPROVE: IMPROVE,
    UNIT: UNIT, BUILDING: BUILDING, TECH: TECH, ERA_NAME: ERA_NAME,
    DIFFICULTY: DIFFICULTY, AI_CIVS: AI_CIVS, isFlat: isFlat
  };
})();
