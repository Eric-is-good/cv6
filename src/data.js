(function defineGameData(global) {
  'use strict';

  const TERRAINS = {
    grassland: { name: '草原', food: 2, production: 0, gold: 0, science: 0, culture: 0, move: 1, defense: 0, color: '#547e50', icon: '·' },
    plains: { name: '平原', food: 1, production: 1, gold: 0, science: 0, culture: 0, move: 1, defense: 0, color: '#8e8a55', icon: '·' },
    desert: { name: '沙漠', food: 0, production: 0, gold: 0, science: 0, culture: 0, move: 1, defense: 0, color: '#b3955c', icon: '∴' },
    tundra: { name: '冻土', food: 1, production: 0, gold: 0, science: 0, culture: 0, move: 1, defense: 0, color: '#87908a', icon: '·' },
    snow: { name: '雪地', food: 0, production: 0, gold: 0, science: 0, culture: 0, move: 1, defense: 0, color: '#c9d2d0', icon: '·' },
    coast: { name: '海岸', food: 1, production: 0, gold: 1, science: 0, culture: 0, move: 1, defense: 0, water: true, color: '#367c8a', icon: '≈' },
    ocean: { name: '海洋', food: 1, production: 0, gold: 0, science: 0, culture: 0, move: 1, defense: 0, water: true, color: '#245b72', icon: '≋' },
  };

  const FEATURES = {
    forest: { name: '森林', food: 0, production: 1, move: 2, defense: 3, icon: '♠' },
    rainforest: { name: '雨林', food: 1, production: 0, move: 2, defense: 3, icon: '♣' },
    marsh: { name: '沼泽', food: 1, production: 0, move: 2, defense: -2, icon: '≋' },
    oasis: { name: '绿洲', food: 3, production: 0, gold: 1, move: 1, defense: 0, icon: '◉' },
    reef: { name: '珊瑚礁', food: 1, production: 1, science: 1, move: 1, defense: 0, icon: '⌇' },
    hills: { name: '丘陵', food: 0, production: 1, move: 2, defense: 3, icon: '⌃' },
    mountain: { name: '山脉', food: 0, production: 0, move: 99, defense: 6, impassable: true, icon: '▲' },
  };

  const RESOURCES = {
    wheat: { name: '小麦', type: 'bonus', food: 1, icon: '♨', improvement: 'farm' },
    rice: { name: '稻米', type: 'bonus', food: 1, icon: '⌇', improvement: 'farm' },
    cattle: { name: '牛群', type: 'bonus', food: 1, production: 1, icon: '♉', improvement: 'pasture' },
    stone: { name: '石材', type: 'bonus', production: 1, icon: '◆', improvement: 'quarry' },
    fish: { name: '鱼群', type: 'bonus', food: 1, icon: '◒', improvement: 'boats' },
    horses: { name: '马', type: 'strategic', food: 1, production: 1, icon: '♞', improvement: 'pasture' },
    iron: { name: '铁', type: 'strategic', production: 1, icon: '⬟', improvement: 'mine', revealTech: 'bronzeWorking' },
    spices: { name: '香料', type: 'luxury', food: 1, gold: 2, amenities: 1, icon: '✣', improvement: 'plantation' },
    silk: { name: '丝绸', type: 'luxury', culture: 1, gold: 2, amenities: 1, icon: '〽', improvement: 'plantation' },
  };

  const IMPROVEMENTS = {
    farm: { name: '农场', food: 1, icon: '田', valid: ['grassland', 'plains'], tech: 'pottery' },
    mine: { name: '矿山', production: 2, icon: '⛏', feature: 'hills', tech: 'mining' },
    pasture: { name: '牧场', food: 1, production: 1, icon: '⌂', resources: ['cattle', 'horses'], tech: 'animalHusbandry' },
    quarry: { name: '采石场', production: 2, icon: '▥', resources: ['stone'], tech: 'mining' },
    plantation: { name: '种植园', gold: 2, icon: '♧', resources: ['spices', 'silk'], tech: 'irrigation' },
    boats: { name: '渔船', food: 1, gold: 1, icon: '⌁', resources: ['fish'], tech: 'sailing' },
  };

  const UNITS = {
    settler: { name: '开拓者', symbol: '民', cost: 80, movement: 2, strength: 0, vision: 2, civilian: true, actions: ['settle'] },
    builder: { name: '建造者', symbol: '工', cost: 50, movement: 2, strength: 0, vision: 2, civilian: true, charges: 3, actions: ['improve'] },
    scout: { name: '斥候', symbol: '斥', cost: 30, movement: 3, strength: 10, vision: 3, unitClass: 'recon' },
    warrior: { name: '勇士', symbol: '勇', cost: 40, movement: 2, strength: 20, vision: 2, unitClass: 'melee' },
    slinger: { name: '投石兵', symbol: '投', cost: 35, movement: 2, strength: 5, rangedStrength: 15, range: 1, vision: 2, unitClass: 'ranged' },
    archer: { name: '弓箭手', symbol: '弓', cost: 60, movement: 2, strength: 15, rangedStrength: 25, range: 2, vision: 2, unitClass: 'ranged', tech: 'archery' },
    spearman: { name: '枪兵', symbol: '枪', cost: 65, movement: 2, strength: 25, vision: 2, unitClass: 'antiCavalry', tech: 'bronzeWorking' },
    horseman: { name: '骑手', symbol: '骑', cost: 80, movement: 4, strength: 36, vision: 2, unitClass: 'cavalry', tech: 'horsebackRiding' },
    swordsman: { name: '剑客', symbol: '剑', cost: 90, movement: 2, strength: 35, vision: 2, unitClass: 'melee', tech: 'ironWorking' },
  };

  const BUILDINGS = {
    monument: { name: '纪念碑', icon: '▥', cost: 60, culture: 2, description: '每回合 +2 文化。' },
    granary: { name: '粮仓', icon: '♨', cost: 65, food: 1, housing: 2, tech: 'pottery', description: '+1 粮食，+2 住房。' },
    walls: { name: '远古城墙', icon: '▦', cost: 80, defense: 15, tech: 'masonry', description: '提高城市防御并允许远程攻击。' },
    library: { name: '图书馆', icon: '▤', cost: 90, science: 2, tech: 'writing', description: '每回合 +2 科技。' },
    barracks: { name: '兵营', icon: '⚑', cost: 90, production: 1, civic: 'stateWorkforce', description: '训练单位时获得额外经验。' },
    waterMill: { name: '水磨', icon: '⊙', cost: 80, food: 1, production: 1, tech: 'wheel', description: '+1 粮食，+1 生产力。' },
  };

  const TECHS = {
    pottery: { name: '制陶术', icon: '◒', cost: 25, era: '远古', prereqs: [], unlocks: ['granary', 'farm'] },
    animalHusbandry: { name: '畜牧业', icon: '♞', cost: 25, era: '远古', prereqs: [], unlocks: ['pasture', 'horses'] },
    mining: { name: '采矿业', icon: '⛏', cost: 25, era: '远古', prereqs: [], unlocks: ['mine', 'quarry'] },
    sailing: { name: '航海术', icon: '⌁', cost: 50, era: '远古', prereqs: ['pottery'], unlocks: ['boats'] },
    astrology: { name: '占星术', icon: '✧', cost: 50, era: '远古', prereqs: ['pottery'], unlocks: ['圣地'] },
    irrigation: { name: '灌溉', icon: '≈', cost: 50, era: '远古', prereqs: ['pottery'], unlocks: ['plantation'] },
    writing: { name: '文字', icon: '▤', cost: 50, era: '远古', prereqs: ['pottery'], unlocks: ['library'] },
    archery: { name: '箭术', icon: '弓', cost: 50, era: '远古', prereqs: ['animalHusbandry'], unlocks: ['archer'] },
    bronzeWorking: { name: '青铜器', icon: '枪', cost: 80, era: '远古', prereqs: ['mining'], unlocks: ['spearman', 'iron'] },
    masonry: { name: '砌砖', icon: '▦', cost: 80, era: '远古', prereqs: ['mining'], unlocks: ['walls'] },
    wheel: { name: '轮子', icon: '⊙', cost: 80, era: '远古', prereqs: ['mining'], unlocks: ['waterMill'] },
    currency: { name: '货币', icon: '◈', cost: 120, era: '古典', prereqs: ['writing'], unlocks: ['商业中心'] },
    horsebackRiding: { name: '骑马', icon: '骑', cost: 120, era: '古典', prereqs: ['archery'], unlocks: ['horseman'] },
    ironWorking: { name: '炼铁术', icon: '剑', cost: 120, era: '古典', prereqs: ['bronzeWorking'], unlocks: ['swordsman'] },
  };

  const CIVICS = {
    codeOfLaws: { name: '法典', icon: '§', cost: 20, era: '远古', prereqs: [], unlocks: ['酋邦政体'] },
    craftsmanship: { name: '技艺', icon: '⚒', cost: 40, era: '远古', prereqs: ['codeOfLaws'], unlocks: ['斯巴达教育'] },
    foreignTrade: { name: '对外贸易', icon: '◇', cost: 40, era: '远古', prereqs: ['codeOfLaws'], unlocks: ['商队'] },
    stateWorkforce: { name: '国家劳动力', icon: '⚑', cost: 70, era: '远古', prereqs: ['craftsmanship'], unlocks: ['兵营', '征兵'] },
    earlyEmpire: { name: '帝国初期', icon: '♜', cost: 70, era: '远古', prereqs: ['foreignTrade'], unlocks: ['开放边境'] },
    politicalPhilosophy: { name: '政治哲学', icon: '♛', cost: 110, era: '古典', prereqs: ['stateWorkforce', 'earlyEmpire'], unlocks: ['古典政体'] },
  };

  const CIVILIZATIONS = {
    han: { name: '新汉', leader: '武则天', adjective: '汉', color: '#74d0dd', dark: '#163d4b', cityNames: ['长安', '洛阳', '成都', '建业', '襄阳', '临淄'], trait: '天工开物：建造者额外拥有 1 次使用次数。' },
    rome: { name: '罗马', leader: '图拉真', adjective: '罗马', color: '#d76f62', dark: '#542a31', cityNames: ['罗马', '奥斯提亚', '安提乌克', '库迈', '拉文纳'], trait: '条条大路通罗马：新城市自带纪念碑。' },
    egypt: { name: '埃及', leader: '克利奥帕特拉', adjective: '埃及', color: '#e0b85b', dark: '#54411d', cityNames: ['拉科蒂斯', '孟菲斯', '底比斯', '赫利奥波利斯'], trait: '地中海新娘：沿河城市获得额外生产力。' },
  };

  global.CV6_DATA = Object.freeze({ TERRAINS, FEATURES, RESOURCES, IMPROVEMENTS, UNITS, BUILDINGS, TECHS, CIVICS, CIVILIZATIONS });
})(window);
