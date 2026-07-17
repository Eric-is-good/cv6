(function defineGameEngine(global, DATA) {
  'use strict';

  const SAVE_VERSION = 2;
  const PLAYER_ID = 'han';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tileKey = (x, y) => `${x},${y}`;
  const uid = (prefix, state) => `${prefix}-${state.nextId++}`;

  class Random {
    constructor(seed) {
      const text = String(seed || Date.now());
      let value = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        value ^= text.charCodeAt(index);
        value = Math.imul(value, 16777619);
      }
      this.state = value >>> 0 || 1;
    }

    next() {
      let value = this.state;
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      this.state = value >>> 0;
      return this.state / 4294967296;
    }

    int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
    chance(probability) { return this.next() < probability; }
    pick(items) { return items[Math.floor(this.next() * items.length)]; }
  }

  class GameEngine {
    constructor() {
      this.state = null;
      this.random = null;
    }

    newGame(options = {}) {
      const seed = options.seed || `CV6-${Date.now().toString(36)}`;
      this.random = new Random(seed);
      this.state = {
        version: SAVE_VERSION,
        seed,
        width: options.width || 13,
        height: options.height || 9,
        difficulty: options.difficulty || '王子',
        turn: 1,
        year: -4000,
        activeCiv: PLAYER_ID,
        playerCiv: PLAYER_ID,
        nextId: 1,
        randomState: this.random.state,
        tiles: [],
        civilizations: [],
        cities: [],
        units: [],
        events: [],
        winner: null,
        victoryType: null,
      };

      this.generateMap();
      this.createCivilizations();
      this.placeStartingEmpires();
      this.refreshVisibility();
      this.addEvent('world', '文明的黎明', '新汉人民在长安河谷建立了第一座城市。探索、发展，并带领文明经受时间考验。');
      this.addEvent('research', '选择研究', '制陶术与法典已经列入议程。');
      return this.state;
    }

    generateMap() {
      const { width, height } = this.state;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
          const latitude = Math.abs((y / (height - 1)) * 2 - 1);
          let terrain;
          if (edge === 0) terrain = 'ocean';
          else if (edge === 1 && this.random.chance(0.48)) terrain = 'coast';
          else if (latitude > 0.8) terrain = this.random.chance(0.42) ? 'snow' : 'tundra';
          else if (latitude > 0.62) terrain = this.random.chance(0.55) ? 'tundra' : 'plains';
          else if (this.random.chance(0.17)) terrain = 'desert';
          else terrain = this.random.chance(0.54) ? 'grassland' : 'plains';

          const tile = {
            x, y, terrain, feature: null, resource: null, improvement: null,
            river: false, road: false, owner: null, cityId: null,
          };
          if (!DATA.TERRAINS[terrain].water) {
            const featureRoll = this.random.next();
            if (featureRoll < 0.07) tile.feature = 'mountain';
            else if (featureRoll < 0.22) tile.feature = 'hills';
            else if (featureRoll < 0.37 && terrain !== 'desert' && terrain !== 'snow') tile.feature = 'forest';
            else if (featureRoll < 0.43 && terrain === 'grassland') tile.feature = 'rainforest';
            else if (featureRoll < 0.47 && terrain === 'grassland') tile.feature = 'marsh';
            else if (terrain === 'desert' && this.random.chance(0.08)) tile.feature = 'oasis';
            tile.river = this.random.chance(0.11);
          } else if (terrain === 'coast' && this.random.chance(0.12)) {
            tile.feature = 'reef';
          }
          tile.resource = this.rollResource(tile);
          this.state.tiles.push(tile);
        }
      }

      const starts = [{ x: 2, y: 4 }, { x: width - 3, y: 2 }, { x: width - 3, y: height - 3 }];
      starts.forEach((position, index) => this.normalizeStart(position.x, position.y, index));
    }

    rollResource(tile) {
      if (!this.random.chance(0.16)) return null;
      if (DATA.TERRAINS[tile.terrain].water) return tile.terrain === 'coast' ? 'fish' : null;
      if (tile.feature === 'mountain') return null;
      if (tile.terrain === 'grassland') return this.random.pick(['wheat', 'rice', 'cattle', 'horses', 'silk']);
      if (tile.terrain === 'plains') return this.random.pick(['wheat', 'cattle', 'stone', 'horses', 'iron']);
      if (tile.terrain === 'desert') return this.random.pick(['stone', 'iron', 'spices']);
      if (tile.terrain === 'tundra') return this.random.pick(['stone', 'iron']);
      return null;
    }

    normalizeStart(x, y, index) {
      this.tilesInRadius(x, y, 1).forEach((tile, tileIndex) => {
        tile.terrain = tileIndex % 3 === 0 ? 'plains' : 'grassland';
        tile.feature = tileIndex === 2 ? 'hills' : tileIndex === 4 ? 'forest' : null;
        tile.resource = null;
        tile.river = tileIndex === 0 || tileIndex === 3;
      });
      const bonuses = ['wheat', index === 0 ? 'horses' : 'cattle', 'stone'];
      const ring = this.tilesInRadius(x, y, 2).filter((tile) => this.distance({ x, y }, tile) === 2 && !DATA.TERRAINS[tile.terrain].water && tile.feature !== 'mountain');
      bonuses.forEach((resource, resourceIndex) => { if (ring[resourceIndex * 2]) ring[resourceIndex * 2].resource = resource; });
    }

    createCivilizations() {
      ['han', 'rome', 'egypt'].forEach((id, index) => {
        const definition = DATA.CIVILIZATIONS[id];
        const relations = {};
        ['han', 'rome', 'egypt'].filter((other) => other !== id).forEach((other) => {
          relations[other] = { met: false, status: 'peace', opinion: index === 0 ? 0 : this.random.int(-8, 12), warTurns: 0 };
        });
        this.state.civilizations.push({
          id,
          name: definition.name,
          leader: definition.leader,
          color: definition.color,
          dark: definition.dark,
          isHuman: id === PLAYER_ID,
          alive: true,
          gold: id === PLAYER_ID ? 50 : 80,
          faith: 0,
          science: 0,
          culture: 0,
          score: 0,
          eraScore: 0,
          researched: [],
          completedCivics: [],
          currentResearch: id === PLAYER_ID ? 'pottery' : this.random.pick(['pottery', 'animalHusbandry', 'mining']),
          researchProgress: 0,
          currentCivic: 'codeOfLaws',
          civicProgress: 0,
          revealed: {},
          visible: {},
          relations,
          cityNameIndex: 0,
        });
      });
    }

    placeStartingEmpires() {
      const starts = {
        han: { x: 2, y: 4 },
        rome: { x: this.state.width - 3, y: 2 },
        egypt: { x: this.state.width - 3, y: this.state.height - 3 },
      };
      Object.entries(starts).forEach(([civId, position]) => {
        const definition = DATA.CIVILIZATIONS[civId];
        this.addCity(civId, position.x, position.y, definition.cityNames[0], true);
        this.addUnit(civId, 'warrior', position.x + (position.x < 5 ? 1 : -1), position.y);
        this.addUnit(civId, civId === PLAYER_ID ? 'scout' : 'slinger', position.x, position.y + 1);
        if (civId === PLAYER_ID) this.addUnit(civId, 'builder', position.x + 1, position.y + 1);
      });
      const playerCity = this.getCapital(PLAYER_ID);
      playerCity.queue = { kind: 'building', id: 'monument' };
    }

    getTile(x, y) {
      if (x < 0 || y < 0 || x >= this.state.width || y >= this.state.height) return null;
      return this.state.tiles[y * this.state.width + x];
    }

    getCiv(id) { return this.state.civilizations.find((civ) => civ.id === id); }
    getCity(id) { return this.state.cities.find((city) => city.id === id); }
    getUnit(id) { return this.state.units.find((unit) => unit.id === id); }
    getCapital(civId) { return this.state.cities.find((city) => city.owner === civId && city.isCapital); }
    getCities(civId) { return this.state.cities.filter((city) => city.owner === civId); }
    getUnits(civId) { return this.state.units.filter((unit) => unit.owner === civId); }
    getUnitsAt(x, y) { return this.state.units.filter((unit) => unit.x === x && unit.y === y); }
    getCityAt(x, y) { return this.state.cities.find((city) => city.x === x && city.y === y); }

    neighbors(x, y) {
      const diagonal = y % 2 === 0 ? -1 : 1;
      return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1], [x + diagonal, y - 1], [x + diagonal, y + 1]]
        .map(([nextX, nextY]) => this.getTile(nextX, nextY))
        .filter(Boolean);
    }

    offsetToCube(point) {
      const cubeX = point.x - (point.y - (point.y & 1)) / 2;
      const cubeZ = point.y;
      return { x: cubeX, z: cubeZ, y: -cubeX - cubeZ };
    }

    distance(a, b) {
      const first = this.offsetToCube(a);
      const second = this.offsetToCube(b);
      return Math.max(Math.abs(first.x - second.x), Math.abs(first.y - second.y), Math.abs(first.z - second.z));
    }

    tilesInRadius(x, y, radius) {
      return this.state.tiles.filter((tile) => this.distance({ x, y }, tile) <= radius);
    }

    isPassable(tile, unit) {
      if (!tile || DATA.FEATURES[tile.feature]?.impassable) return false;
      if (DATA.TERRAINS[tile.terrain].water && !unit?.naval) return false;
      return true;
    }

    movementCost(tile) {
      return Math.max(DATA.TERRAINS[tile.terrain].move || 1, DATA.FEATURES[tile.feature]?.move || 1);
    }

    addCity(owner, x, y, requestedName, isCapital = false) {
      const civ = this.getCiv(owner);
      const definition = DATA.CIVILIZATIONS[owner];
      const name = requestedName || definition.cityNames[civ.cityNameIndex % definition.cityNames.length];
      civ.cityNameIndex += 1;
      const city = {
        id: uid('city', this.state), owner, x, y, name, isCapital,
        population: 1, housing: 5, amenities: 0, foodStored: 0,
        productionStored: 0, queue: null, buildings: [], hp: 200, maxHp: 200,
        defense: 20, foundedTurn: this.state.turn,
      };
      if (owner === 'rome') city.buildings.push('monument');
      this.state.cities.push(city);
      this.tilesInRadius(x, y, 1).forEach((tile) => { if (!tile.owner || tile.x === x && tile.y === y) tile.owner = owner; });
      const center = this.getTile(x, y);
      center.cityId = city.id;
      center.owner = owner;
      center.feature = null;
      center.improvement = null;
      return city;
    }

    addUnit(owner, type, x, y) {
      const definition = DATA.UNITS[type];
      const unit = {
        id: uid('unit', this.state), owner, type, x, y, hp: 100, maxHp: 100,
        movement: definition.movement, maxMovement: definition.movement,
        charges: definition.charges || 0, fortified: false, fortifyTurns: 0,
        xp: 0, level: 1, acted: false,
      };
      if (owner === PLAYER_ID && type === 'builder') unit.charges += 1;
      this.state.units.push(unit);
      return unit;
    }

    getTileYields(tile, viewer = PLAYER_ID) {
      const total = { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
      const add = (source) => {
        if (!source) return;
        Object.keys(total).forEach((yieldName) => { total[yieldName] += source[yieldName] || 0; });
      };
      add(DATA.TERRAINS[tile.terrain]);
      add(DATA.FEATURES[tile.feature]);
      const resource = DATA.RESOURCES[tile.resource];
      if (!resource?.revealTech || this.getCiv(viewer).researched.includes(resource.revealTech)) add(resource);
      add(DATA.IMPROVEMENTS[tile.improvement]);
      return total;
    }

    getCityYield(city) {
      const total = { food: 2, production: 2, gold: 3, science: city.population + 1, culture: 1, faith: 0 };
      const workable = this.tilesInRadius(city.x, city.y, 2)
        .filter((tile) => tile.owner === city.owner && !(tile.x === city.x && tile.y === city.y) && !DATA.TERRAINS[tile.terrain].water && tile.feature !== 'mountain')
        .map((tile) => ({ tile, yields: this.getTileYields(tile, city.owner) }))
        .sort((a, b) => (b.yields.food * 1.4 + b.yields.production * 1.2 + b.yields.gold) - (a.yields.food * 1.4 + a.yields.production * 1.2 + a.yields.gold))
        .slice(0, city.population);
      workable.forEach((entry) => Object.keys(total).forEach((yieldName) => { total[yieldName] += entry.yields[yieldName] || 0; }));
      city.buildings.forEach((buildingId) => {
        const building = DATA.BUILDINGS[buildingId];
        Object.keys(total).forEach((yieldName) => { total[yieldName] += building[yieldName] || 0; });
      });
      if (city.owner === 'egypt' && this.getTile(city.x, city.y).river) total.production *= 1.15;
      return Object.fromEntries(Object.entries(total).map(([name, value]) => [name, Math.round(value * 10) / 10]));
    }

    getEmpireYield(civId) {
      const total = { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
      this.getCities(civId).forEach((city) => {
        const cityYield = this.getCityYield(city);
        Object.keys(total).forEach((name) => { total[name] += cityYield[name] || 0; });
      });
      return Object.fromEntries(Object.entries(total).map(([name, value]) => [name, Math.round(value * 10) / 10]));
    }

    canUseTech(civ, requiredTech) { return !requiredTech || civ.researched.includes(requiredTech); }
    canUseCivic(civ, requiredCivic) { return !requiredCivic || civ.completedCivics.includes(requiredCivic); }

    getProductionOptions(cityId) {
      const city = this.getCity(cityId);
      const civ = this.getCiv(city.owner);
      const options = [];
      Object.entries(DATA.UNITS).forEach(([id, unit]) => {
        if (this.canUseTech(civ, unit.tech) && this.canUseCivic(civ, unit.civic)) {
          options.push({ kind: 'unit', id, name: unit.name, icon: unit.symbol, cost: unit.cost, disabled: id === 'settler' && city.population < 2, reason: id === 'settler' && city.population < 2 ? '人口至少需要 2' : '' });
        }
      });
      Object.entries(DATA.BUILDINGS).forEach(([id, building]) => {
        if (!city.buildings.includes(id) && this.canUseTech(civ, building.tech) && this.canUseCivic(civ, building.civic)) {
          options.push({ kind: 'building', id, name: building.name, icon: building.icon, cost: building.cost, disabled: false, description: building.description });
        }
      });
      return options;
    }

    setCityProduction(cityId, kind, itemId) {
      const city = this.getCity(cityId);
      if (!city || city.owner !== this.state.activeCiv) return { ok: false, message: '无法管理这座城市。' };
      const option = this.getProductionOptions(cityId).find((item) => item.kind === kind && item.id === itemId);
      if (!option || option.disabled) return { ok: false, message: option?.reason || '尚未解锁这个项目。' };
      city.queue = { kind, id: itemId };
      city.productionStored = 0;
      this.addEvent('production', `${city.name} 调整生产`, `开始生产${option.name}。`);
      return { ok: true, message: `${city.name}开始生产${option.name}。` };
    }

    processCity(city) {
      const yields = this.getCityYield(city);
      const foodSurplus = Math.max(0.5, yields.food - city.population * 1.5);
      const housingPenalty = city.population >= city.housing ? 0.25 : 1;
      city.foodStored += foodSurplus * housingPenalty;
      const growthCost = 12 + city.population * 8;
      if (city.foodStored >= growthCost) {
        city.foodStored -= growthCost;
        city.population += 1;
        this.addEvent('city', `${city.name}人口增长`, `城市人口已经达到 ${city.population}。`, city.owner);
      }
      if (!city.queue) return;
      city.productionStored += yields.production;
      const definition = city.queue.kind === 'unit' ? DATA.UNITS[city.queue.id] : DATA.BUILDINGS[city.queue.id];
      if (city.productionStored < definition.cost) return;
      const finished = { ...city.queue };
      city.productionStored -= definition.cost;
      city.queue = null;
      if (finished.kind === 'building') {
        city.buildings.push(finished.id);
        city.housing += DATA.BUILDINGS[finished.id].housing || 0;
        city.defense += DATA.BUILDINGS[finished.id].defense || 0;
        this.addEvent('production', `${city.name}完成建造`, `${DATA.BUILDINGS[finished.id].name}已经落成。`, city.owner);
      } else {
        const spawn = this.findSpawnTile(city, finished.id);
        if (spawn) {
          this.addUnit(city.owner, finished.id, spawn.x, spawn.y);
          if (finished.id === 'settler') city.population = Math.max(1, city.population - 1);
          this.addEvent('production', `${city.name}完成训练`, `${DATA.UNITS[finished.id].name}已经可以行动。`, city.owner);
        }
      }
    }

    findSpawnTile(city, unitType) {
      const definition = DATA.UNITS[unitType];
      const candidates = [this.getTile(city.x, city.y), ...this.neighbors(city.x, city.y)];
      return candidates.find((tile) => this.isPassable(tile, definition) && this.canStack(city.owner, unitType, tile.x, tile.y));
    }

    canStack(owner, unitType, x, y, ignoreUnitId = null) {
      const definition = DATA.UNITS[unitType];
      const occupants = this.getUnitsAt(x, y).filter((unit) => unit.id !== ignoreUnitId && unit.owner === owner);
      return definition.civilian ? !occupants.some((unit) => DATA.UNITS[unit.type].civilian) : !occupants.some((unit) => !DATA.UNITS[unit.type].civilian);
    }

    getAvailableTechs(civId) {
      const civ = this.getCiv(civId);
      return Object.entries(DATA.TECHS).filter(([id, tech]) => !civ.researched.includes(id) && tech.prereqs.every((prereq) => civ.researched.includes(prereq))).map(([id]) => id);
    }

    getAvailableCivics(civId) {
      const civ = this.getCiv(civId);
      return Object.entries(DATA.CIVICS).filter(([id, civic]) => !civ.completedCivics.includes(id) && civic.prereqs.every((prereq) => civ.completedCivics.includes(prereq))).map(([id]) => id);
    }

    setResearch(civId, techId) {
      const civ = this.getCiv(civId);
      if (!this.getAvailableTechs(civId).includes(techId)) return { ok: false, message: '前置科技尚未完成。' };
      civ.currentResearch = techId;
      civ.researchProgress = 0;
      return { ok: true, message: `开始研究${DATA.TECHS[techId].name}。` };
    }

    setCivic(civId, civicId) {
      const civ = this.getCiv(civId);
      if (!this.getAvailableCivics(civId).includes(civicId)) return { ok: false, message: '前置市政尚未完成。' };
      civ.currentCivic = civicId;
      civ.civicProgress = 0;
      return { ok: true, message: `开始推进${DATA.CIVICS[civicId].name}。` };
    }

    processResearch(civ, yields) {
      if (civ.currentResearch) {
        civ.researchProgress += yields.science;
        const tech = DATA.TECHS[civ.currentResearch];
        if (civ.researchProgress >= tech.cost) {
          const completed = civ.currentResearch;
          civ.researched.push(completed);
          civ.currentResearch = null;
          civ.researchProgress = 0;
          civ.eraScore += 2;
          this.addEvent('research', `科技完成：${tech.name}`, `已解锁：${tech.unlocks.join('、')}。`, civ.id);
        }
      }
      if (civ.currentCivic) {
        civ.civicProgress += yields.culture;
        const civic = DATA.CIVICS[civ.currentCivic];
        if (civ.civicProgress >= civic.cost) {
          const completed = civ.currentCivic;
          civ.completedCivics.push(completed);
          civ.currentCivic = null;
          civ.civicProgress = 0;
          civ.eraScore += 2;
          this.addEvent('civic', `市政完成：${civic.name}`, `已解锁：${civic.unlocks.join('、')}。`, civ.id);
        }
      }
    }

    processCivilization(civId) {
      const civ = this.getCiv(civId);
      if (!civ?.alive) return;
      const yields = this.getEmpireYield(civId);
      civ.gold += Math.round(yields.gold + this.getCities(civId).length * 2 - this.getUnits(civId).length * 0.5);
      civ.science += yields.science;
      civ.culture += yields.culture;
      civ.faith += yields.faith;
      this.processResearch(civ, yields);
      this.getCities(civId).forEach((city) => this.processCity(city));
      civ.score = this.getCities(civId).reduce((sum, city) => sum + city.population * 5 + city.buildings.length * 3, 0) + civ.researched.length * 4 + civ.completedCivics.length * 4 + civ.eraScore;
    }

    getReachable(unitId) {
      const unit = this.getUnit(unitId);
      if (!unit || unit.movement <= 0) return {};
      const reached = { [tileKey(unit.x, unit.y)]: 0 };
      const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
      while (queue.length) {
        const current = queue.shift();
        this.neighbors(current.x, current.y).forEach((tile) => {
          if (!this.isPassable(tile, unit)) return;
          const cost = current.cost + this.movementCost(tile);
          const targetKey = tileKey(tile.x, tile.y);
          if (cost > unit.movement || reached[targetKey] !== undefined && reached[targetKey] <= cost) return;
          const enemies = this.getUnitsAt(tile.x, tile.y).some((other) => other.owner !== unit.owner);
          const enemyCity = this.getCityAt(tile.x, tile.y)?.owner !== unit.owner && Boolean(this.getCityAt(tile.x, tile.y));
          reached[targetKey] = cost;
          if (!enemies && !enemyCity && this.canStack(unit.owner, unit.type, tile.x, tile.y, unit.id)) queue.push({ x: tile.x, y: tile.y, cost });
        });
      }
      delete reached[tileKey(unit.x, unit.y)];
      return reached;
    }

    moveUnit(unitId, x, y) {
      const unit = this.getUnit(unitId);
      if (!unit || unit.owner !== this.state.activeCiv) return { ok: false, message: '这个单位现在不能行动。' };
      const targetTile = this.getTile(x, y);
      const reachable = this.getReachable(unitId);
      if (reachable[tileKey(x, y)] === undefined) return { ok: false, message: '该地块无法抵达。' };
      const enemyUnit = this.getUnitsAt(x, y).find((other) => other.owner !== unit.owner && !DATA.UNITS[other.type].civilian) || this.getUnitsAt(x, y).find((other) => other.owner !== unit.owner);
      const enemyCity = this.getCityAt(x, y);
      if (enemyUnit) return this.attackUnit(unitId, enemyUnit.id, false);
      if (enemyCity && enemyCity.owner !== unit.owner) return this.attackCity(unitId, enemyCity.id, false);
      if (!this.canStack(unit.owner, unit.type, x, y, unit.id)) return { ok: false, message: '同类单位不能堆叠。' };
      unit.x = targetTile.x;
      unit.y = targetTile.y;
      unit.movement -= reachable[tileKey(x, y)];
      unit.fortified = false;
      unit.fortifyTurns = 0;
      this.refreshVisibility();
      this.updateDiplomaticContact();
      return { ok: true, message: `${DATA.UNITS[unit.type].name}移动到${DATA.TERRAINS[targetTile.terrain].name}。` };
    }

    getAttackTargets(unitId) {
      const unit = this.getUnit(unitId);
      if (!unit) return [];
      const definition = DATA.UNITS[unit.type];
      const range = definition.range || 1;
      const targets = [];
      this.state.units.filter((other) => other.owner !== unit.owner && this.distance(unit, other) <= range).forEach((other) => targets.push({ kind: 'unit', id: other.id, x: other.x, y: other.y }));
      this.state.cities.filter((city) => city.owner !== unit.owner && this.distance(unit, city) <= range).forEach((city) => targets.push({ kind: 'city', id: city.id, x: city.x, y: city.y }));
      return targets;
    }

    ensureWar(attackerOwner, defenderOwner) {
      const relation = this.getCiv(attackerOwner).relations[defenderOwner];
      if (relation.status !== 'war') this.declareWar(attackerOwner, defenderOwner, true);
    }

    combatDamage(attackerStrength, defenderStrength) {
      const variance = this.random.int(-4, 4);
      return clamp(Math.round(30 * Math.exp((attackerStrength - defenderStrength + variance) / 25)), 8, 65);
    }

    unitStrength(unit, defending = false) {
      const definition = DATA.UNITS[unit.type];
      const terrain = this.getTile(unit.x, unit.y);
      const fortify = defending && unit.fortified ? Math.min(6, unit.fortifyTurns * 3) : 0;
      const terrainDefense = defending ? DATA.FEATURES[terrain.feature]?.defense || 0 : 0;
      const healthPenalty = Math.floor((100 - unit.hp) / 10);
      return (definition.strength || 1) + unit.level * 2 + fortify + terrainDefense - healthPenalty;
    }

    attackUnit(attackerId, defenderId, forceRanged = false) {
      const attacker = this.getUnit(attackerId);
      const defender = this.getUnit(defenderId);
      if (!attacker || !defender || attacker.owner !== this.state.activeCiv || attacker.movement <= 0) return { ok: false, message: '无法发动攻击。' };
      const attackerDef = DATA.UNITS[attacker.type];
      const distance = this.distance(attacker, defender);
      const ranged = forceRanged || Boolean(attackerDef.rangedStrength && distance > 1);
      if (distance > (ranged ? attackerDef.range : 1)) return { ok: false, message: '目标超出攻击范围。' };
      this.ensureWar(attacker.owner, defender.owner);
      const attackStrength = ranged ? attackerDef.rangedStrength : this.unitStrength(attacker);
      const defenseStrength = this.unitStrength(defender, true);
      const damage = this.combatDamage(attackStrength, defenseStrength);
      defender.hp -= damage;
      let counterDamage = 0;
      if (!ranged && defender.hp > 0 && !DATA.UNITS[defender.type].civilian) {
        counterDamage = this.combatDamage(defenseStrength, this.unitStrength(attacker, true));
        attacker.hp -= counterDamage;
      }
      attacker.movement = 0;
      attacker.acted = true;
      attacker.xp += 5;
      const defenderName = DATA.UNITS[defender.type].name;
      let message = `对${defenderName}造成 ${damage} 点伤害`;
      if (counterDamage) message += `，受到 ${counterDamage} 点反击伤害`;
      if (defender.hp <= 0) {
        const formerPosition = { x: defender.x, y: defender.y };
        this.removeUnit(defender.id);
        message += `，${defenderName}被消灭`;
        if (!ranged && attacker.hp > 0 && this.canStack(attacker.owner, attacker.type, formerPosition.x, formerPosition.y, attacker.id)) {
          attacker.x = formerPosition.x;
          attacker.y = formerPosition.y;
        }
      }
      if (attacker.hp <= 0) { this.removeUnit(attacker.id); message += '，我方单位也在战斗中阵亡'; }
      this.addEvent('combat', '战斗报告', `${message}。`, attacker.owner);
      this.refreshVisibility();
      this.checkCivilizations();
      return { ok: true, message: `${message}。` };
    }

    attackCity(attackerId, cityId, forceRanged = false) {
      const attacker = this.getUnit(attackerId);
      const city = this.getCity(cityId);
      if (!attacker || !city || attacker.movement <= 0) return { ok: false, message: '无法攻击城市。' };
      const definition = DATA.UNITS[attacker.type];
      const distance = this.distance(attacker, city);
      const ranged = forceRanged || Boolean(definition.rangedStrength && distance > 1);
      if (distance > (ranged ? definition.range : 1)) return { ok: false, message: '城市超出攻击范围。' };
      this.ensureWar(attacker.owner, city.owner);
      const strength = ranged ? definition.rangedStrength : this.unitStrength(attacker);
      const damage = this.combatDamage(strength, city.defense);
      city.hp -= damage;
      let counterDamage = 0;
      if (!ranged) {
        counterDamage = this.combatDamage(city.defense, this.unitStrength(attacker, true));
        attacker.hp -= counterDamage;
      }
      attacker.movement = 0;
      attacker.xp += 6;
      let message = `对${city.name}造成 ${damage} 点城防伤害`;
      if (counterDamage) message += `，受到 ${counterDamage} 点反击伤害`;
      if (city.hp <= 0 && !ranged && attacker.hp > 0) {
        const formerOwner = city.owner;
        city.owner = attacker.owner;
        city.hp = 80;
        city.isCapital = city.isCapital;
        this.tilesInRadius(city.x, city.y, 1).forEach((tile) => { tile.owner = attacker.owner; });
        attacker.x = city.x;
        attacker.y = city.y;
        message += `，${city.name}已被占领`;
        this.addEvent('combat', '城市陷落', `${DATA.CIVILIZATIONS[attacker.owner].name}占领了${city.name}。`, PLAYER_ID);
        this.getCiv(formerOwner).relations[attacker.owner].opinion -= 50;
      }
      if (attacker.hp <= 0) { this.removeUnit(attacker.id); message += '，攻击单位阵亡'; }
      this.checkCivilizations();
      this.checkVictory();
      this.refreshVisibility();
      return { ok: true, message: `${message}。` };
    }

    removeUnit(unitId) { this.state.units = this.state.units.filter((unit) => unit.id !== unitId); }

    fortifyUnit(unitId) {
      const unit = this.getUnit(unitId);
      if (!unit || unit.owner !== this.state.activeCiv || DATA.UNITS[unit.type].civilian) return { ok: false, message: '该单位无法驻防。' };
      unit.fortified = true;
      unit.fortifyTurns = Math.max(1, unit.fortifyTurns);
      unit.movement = 0;
      return { ok: true, message: `${DATA.UNITS[unit.type].name}进入驻防状态。` };
    }

    healUnit(unitId) {
      const unit = this.getUnit(unitId);
      if (!unit || unit.movement <= 0 || unit.hp >= unit.maxHp) return { ok: false, message: '该单位现在无法休整。' };
      const friendly = this.getTile(unit.x, unit.y).owner === unit.owner;
      unit.hp = Math.min(unit.maxHp, unit.hp + (friendly ? 15 : 10));
      unit.movement = 0;
      return { ok: true, message: `${DATA.UNITS[unit.type].name}恢复了生命值。` };
    }

    canSettle(unitId) {
      const unit = this.getUnit(unitId);
      if (!unit || unit.type !== 'settler') return false;
      const tile = this.getTile(unit.x, unit.y);
      return this.isPassable(tile, unit) && !this.state.cities.some((city) => this.distance(unit, city) < 4);
    }

    settleCity(unitId) {
      const unit = this.getUnit(unitId);
      if (!this.canSettle(unitId)) return { ok: false, message: '城市必须与其他城市相距至少 4 格。' };
      const city = this.addCity(unit.owner, unit.x, unit.y);
      this.removeUnit(unit.id);
      this.addEvent('city', `${city.name}建立`, `新的城市加入了${DATA.CIVILIZATIONS[city.owner].name}。`, city.owner);
      this.refreshVisibility();
      return { ok: true, message: `${city.name}建立了！` , cityId: city.id };
    }

    getImprovementOptions(unitId) {
      const unit = this.getUnit(unitId);
      if (!unit || unit.type !== 'builder' || unit.charges <= 0) return [];
      const tile = this.getTile(unit.x, unit.y);
      if (tile.improvement || tile.cityId) return [];
      const civ = this.getCiv(unit.owner);
      return Object.entries(DATA.IMPROVEMENTS).filter(([improvementId, improvement]) => {
        if (!this.canUseTech(civ, improvement.tech)) return false;
        if (improvement.resources && !improvement.resources.includes(tile.resource)) return false;
        if (improvement.valid && !improvement.valid.includes(tile.terrain)) return false;
        if (improvement.feature && tile.feature !== improvement.feature && DATA.RESOURCES[tile.resource]?.improvement !== improvementId) return false;
        if (DATA.TERRAINS[tile.terrain].water && improvement.name !== '渔船') return false;
        return true;
      }).map(([id]) => id);
    }

    buildImprovement(unitId, improvementId) {
      const unit = this.getUnit(unitId);
      if (!this.getImprovementOptions(unitId).includes(improvementId)) return { ok: false, message: '此地无法建造该设施，或尚未解锁对应科技。' };
      const tile = this.getTile(unit.x, unit.y);
      tile.improvement = improvementId;
      tile.owner = unit.owner;
      unit.charges -= 1;
      unit.movement = 0;
      const name = DATA.IMPROVEMENTS[improvementId].name;
      if (unit.charges <= 0) this.removeUnit(unit.id);
      return { ok: true, message: `${name}建造完成。` };
    }

    declareWar(attackerId, defenderId, automatic = false) {
      const attacker = this.getCiv(attackerId);
      const defender = this.getCiv(defenderId);
      if (!attacker || !defender || attackerId === defenderId) return { ok: false, message: '无法宣战。' };
      attacker.relations[defenderId].status = 'war';
      defender.relations[attackerId].status = 'war';
      attacker.relations[defenderId].met = true;
      defender.relations[attackerId].met = true;
      attacker.relations[defenderId].warTurns = 0;
      defender.relations[attackerId].warTurns = 0;
      defender.relations[attackerId].opinion -= 30;
      if (!automatic || attackerId === PLAYER_ID || defenderId === PLAYER_ID) this.addEvent('diplomacy', '战争爆发', `${attacker.name}向${defender.name}宣战。`, PLAYER_ID);
      return { ok: true, message: `已经向${defender.name}宣战。` };
    }

    proposePeace(requesterId, targetId) {
      const requester = this.getCiv(requesterId);
      const target = this.getCiv(targetId);
      const relation = requester?.relations[targetId];
      if (!relation || relation.status !== 'war') return { ok: false, message: '双方目前没有处于战争状态。' };
      if (relation.warTurns < 5) return { ok: false, message: '战争刚刚开始，对方拒绝议和。' };
      requester.relations[targetId].status = 'peace';
      target.relations[requesterId].status = 'peace';
      requester.relations[targetId].warTurns = 0;
      target.relations[requesterId].warTurns = 0;
      this.addEvent('diplomacy', '和平条约', `${requester.name}与${target.name}恢复和平。`, PLAYER_ID);
      return { ok: true, message: `与${target.name}签署了和平条约。` };
    }

    refreshVisibility() {
      this.state.civilizations.forEach((civ) => {
        const visible = {};
        this.getCities(civ.id).forEach((city) => this.tilesInRadius(city.x, city.y, 3).forEach((tile) => { visible[tileKey(tile.x, tile.y)] = true; civ.revealed[tileKey(tile.x, tile.y)] = true; }));
        this.getUnits(civ.id).forEach((unit) => {
          const vision = DATA.UNITS[unit.type].vision || 2;
          this.tilesInRadius(unit.x, unit.y, vision).forEach((tile) => { visible[tileKey(tile.x, tile.y)] = true; civ.revealed[tileKey(tile.x, tile.y)] = true; });
        });
        civ.visible = visible;
      });
    }

    updateDiplomaticContact() {
      const player = this.getCiv(PLAYER_ID);
      this.state.civilizations.filter((civ) => civ.id !== PLAYER_ID).forEach((civ) => {
        if (player.relations[civ.id].met) return;
        const discovered = [...this.getCities(civ.id), ...this.getUnits(civ.id)].some((item) => player.visible[tileKey(item.x, item.y)]);
        if (discovered) {
          player.relations[civ.id].met = true;
          civ.relations[PLAYER_ID].met = true;
          this.addEvent('diplomacy', `遇见${civ.name}`, `${civ.leader}代表${civ.name}向你致意。`, PLAYER_ID);
        }
      });
    }

    resetUnits(civId) {
      this.getUnits(civId).forEach((unit) => {
        const definition = DATA.UNITS[unit.type];
        unit.maxMovement = definition.movement;
        unit.movement = definition.movement;
        unit.acted = false;
        if (unit.fortified) {
          unit.fortifyTurns = Math.min(2, unit.fortifyTurns + 1);
          if (unit.hp < unit.maxHp) unit.hp = Math.min(unit.maxHp, unit.hp + 10);
        }
        if (unit.xp >= unit.level * 15) { unit.level += 1; unit.xp = 0; }
      });
    }

    chooseAIResearch(civ) {
      if (!civ.currentResearch) {
        const available = this.getAvailableTechs(civ.id);
        civ.currentResearch = available.length ? this.random.pick(available) : null;
        civ.researchProgress = 0;
      }
      if (!civ.currentCivic) {
        const available = this.getAvailableCivics(civ.id);
        civ.currentCivic = available.length ? this.random.pick(available) : null;
        civ.civicProgress = 0;
      }
    }

    chooseAIProduction(civId) {
      this.getCities(civId).forEach((city) => {
        if (city.queue) return;
        const options = this.getProductionOptions(city.id).filter((option) => !option.disabled);
        const militaryCount = this.getUnits(civId).filter((unit) => !DATA.UNITS[unit.type].civilian).length;
        let option;
        if (city.population >= 3 && this.getCities(civId).length < 3 && this.random.chance(0.22)) option = options.find((item) => item.id === 'settler');
        if (!option && militaryCount < this.getCities(civId).length * 2) option = options.find((item) => ['warrior', 'slinger', 'archer'].includes(item.id));
        if (!option) option = options.find((item) => item.kind === 'building') || options[0];
        if (option) { city.queue = { kind: option.kind, id: option.id }; city.productionStored = 0; }
      });
    }

    runAITurn(civId) {
      const civ = this.getCiv(civId);
      if (!civ?.alive) return;
      this.state.activeCiv = civId;
      this.chooseAIResearch(civ);
      this.chooseAIProduction(civId);
      if (this.state.turn > 16 && civ.relations[PLAYER_ID].met && civ.relations[PLAYER_ID].status === 'peace' && civ.relations[PLAYER_ID].opinion < -4 && this.random.chance(0.08)) this.declareWar(civId, PLAYER_ID, true);
      const units = [...this.getUnits(civId)];
      units.forEach((unit) => {
        if (!this.getUnit(unit.id)) return;
        if (unit.type === 'settler') { this.runAISettler(unit); return; }
        if (unit.type === 'builder') { this.runAIBuilder(unit); return; }
        this.runAIMilitary(unit);
      });
      Object.values(civ.relations).forEach((relation) => { if (relation.status === 'war') relation.warTurns += 1; });
    }

    runAISettler(unit) {
      if (this.canSettle(unit.id)) { this.settleCity(unit.id); return; }
      this.moveAIRandom(unit);
    }

    runAIBuilder(unit) {
      const options = this.getImprovementOptions(unit.id);
      if (options.length) { this.buildImprovement(unit.id, options[0]); return; }
      const city = this.getCapital(unit.owner);
      this.moveAIToward(unit, city || { x: unit.x, y: unit.y });
    }

    runAIMilitary(unit) {
      const enemies = this.state.units.filter((other) => other.owner !== unit.owner && this.getCiv(unit.owner).relations[other.owner].status === 'war');
      const enemyCities = this.state.cities.filter((city) => city.owner !== unit.owner && this.getCiv(unit.owner).relations[city.owner].status === 'war');
      const targets = [...enemies, ...enemyCities].sort((a, b) => this.distance(unit, a) - this.distance(unit, b));
      const target = targets[0];
      if (target) {
        const attackTarget = this.getAttackTargets(unit.id).find((entry) => entry.id === target.id);
        if (attackTarget) {
          if (attackTarget.kind === 'unit') this.attackUnit(unit.id, target.id, Boolean(DATA.UNITS[unit.type].rangedStrength));
          else this.attackCity(unit.id, target.id, Boolean(DATA.UNITS[unit.type].rangedStrength));
        } else this.moveAIToward(unit, target);
      } else this.moveAIRandom(unit);
    }

    moveAIToward(unit, target) {
      const reachable = this.getReachable(unit.id);
      const choices = Object.keys(reachable).map((position) => {
        const [x, y] = position.split(',').map(Number);
        return { x, y, distance: this.distance({ x, y }, target), cost: reachable[position] };
      }).sort((a, b) => a.distance - b.distance || a.cost - b.cost);
      const choice = choices.find((tile) => !this.getUnitsAt(tile.x, tile.y).some((other) => other.owner !== unit.owner) && !this.getCityAt(tile.x, tile.y));
      if (choice) this.moveUnit(unit.id, choice.x, choice.y);
    }

    moveAIRandom(unit) {
      const reachable = Object.keys(this.getReachable(unit.id));
      if (!reachable.length) return;
      const unexplored = reachable.filter((position) => !this.getCiv(unit.owner).revealed[position]);
      const destination = this.random.pick(unexplored.length ? unexplored : reachable);
      const [x, y] = destination.split(',').map(Number);
      if (!this.getUnitsAt(x, y).some((other) => other.owner !== unit.owner) && !this.getCityAt(x, y)) this.moveUnit(unit.id, x, y);
    }

    endTurn() {
      if (this.state.winner) return { ok: false, message: '游戏已经结束。' };
      this.state.activeCiv = PLAYER_ID;
      this.processCivilization(PLAYER_ID);
      this.state.civilizations.filter((civ) => !civ.isHuman && civ.alive).forEach((civ) => {
        this.resetUnits(civ.id);
        this.processCivilization(civ.id);
        this.runAITurn(civ.id);
      });
      this.state.turn += 1;
      this.state.year = this.yearForTurn(this.state.turn);
      this.state.activeCiv = PLAYER_ID;
      this.resetUnits(PLAYER_ID);
      const player = this.getCiv(PLAYER_ID);
      Object.values(player.relations).forEach((relation) => { if (relation.status === 'war') relation.warTurns += 1; });
      this.refreshVisibility();
      this.updateDiplomaticContact();
      this.checkCivilizations();
      this.checkVictory();
      this.state.randomState = this.random.state;
      return { ok: true, message: `第 ${this.state.turn} 回合开始。` };
    }

    yearForTurn(turn) {
      if (turn <= 30) return -4000 + (turn - 1) * 80;
      if (turn <= 60) return -1680 + (turn - 30) * 50;
      if (turn <= 100) return -180 + (turn - 60) * 25;
      return 820 + (turn - 100) * 10;
    }

    checkCivilizations() {
      this.state.civilizations.forEach((civ) => {
        const hasCity = this.getCities(civ.id).length > 0;
        const hasSettler = this.getUnits(civ.id).some((unit) => unit.type === 'settler');
        civ.alive = hasCity || hasSettler;
      });
    }

    checkVictory() {
      const player = this.getCiv(PLAYER_ID);
      const enemyCapitals = this.state.cities.filter((city) => city.isCapital && city.owner !== PLAYER_ID);
      const originalEnemyCapitalCount = 2;
      if (enemyCapitals.length === 0 && this.state.cities.filter((city) => city.isCapital && city.owner === PLAYER_ID).length > 1) {
        this.state.winner = PLAYER_ID; this.state.victoryType = '统治胜利';
      } else if (player.researched.length === Object.keys(DATA.TECHS).length) {
        this.state.winner = PLAYER_ID; this.state.victoryType = '科技胜利';
      } else if (this.state.turn >= 150) {
        const winner = [...this.state.civilizations].sort((a, b) => b.score - a.score)[0];
        this.state.winner = winner.id; this.state.victoryType = '分数胜利';
      } else if (!player.alive) {
        const winner = this.state.civilizations.find((civ) => civ.alive && civ.id !== PLAYER_ID);
        this.state.winner = winner?.id || 'none'; this.state.victoryType = '文明覆灭';
      }
      void originalEnemyCapitalCount;
    }

    addEvent(type, title, text, audience = PLAYER_ID) {
      if (audience !== PLAYER_ID && audience !== 'all') return;
      this.state.events.unshift({ id: uid('event', this.state), turn: this.state.turn, type, title, text });
      this.state.events = this.state.events.slice(0, 40);
    }

    serialize() {
      this.state.randomState = this.random.state;
      return JSON.stringify(this.state);
    }

    load(serialized) {
      const parsed = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
      if (!parsed || parsed.version !== SAVE_VERSION || !Array.isArray(parsed.tiles)) throw new Error('存档版本不兼容。');
      this.state = parsed;
      this.random = new Random(parsed.seed);
      this.random.state = parsed.randomState || this.random.state;
      this.refreshVisibility();
      return this.state;
    }
  }

  global.CV6Game = { GameEngine, SAVE_VERSION, PLAYER_ID, tileKey };
})(window, window.CV6_DATA);
