// 游戏状态与回合逻辑
import { TERRAINS, RESOURCES, UNITS, BUILDINGS, TECHS, CIVICS, CIVS, IMPROVEMENTS } from './data.js';
import { hexKey, hexNeighbors, hexDistance, hexesInRange } from './hex.js';
import { generateMap, tileYield, findStart } from './map.js';
import { mulberry32 } from './rand.js';

let UID = 1;
const nextId = () => UID++;

const CITY_NAMES = {
  china:  ['北京','洛阳','长安','南京','成都','广州','杭州','西安','重庆','武汉'],
  rome:   ['罗马','拉文纳','拿坡里','奥斯蒂亚','维罗纳','米兰','佛罗伦萨','那不勒斯'],
  egypt:  ['底比斯','孟菲斯','赫利奥波利斯','亚历山大','吉萨','开罗','卢克索'],
  greece: ['雅典','斯巴达','科林斯','底比斯-希','德尔斐','奥林匹亚','米利都'],
  persia: ['波斯波利斯','苏萨','帕萨尔加德','埃克巴坦那','大不里士'],
  mongol: ['哈拉和林','上都','大都','撒马尔罕','布哈拉'],
  japan:  ['京都','江户','大阪','奈良','镰仓','长崎','名古屋'],
  india:  ['德里','华氏城','瓦拉纳西','孟买','加尔各答','马德拉斯'],
};

export class Game {
  constructor({ seed = Date.now() & 0xffffffff, numCivs = 5, mapRadius = 18, humanCivId = 'china' } = {}) {
    this.seed = seed;
    this.rand = mulberry32(seed);
    this.turn = 1;
    this.gameOver = null;            // {winner: civId, type:'science'|...}
    this.cityCounter = {};
    this.notifications = [];

    this.map = generateMap({ radius: mapRadius, seed });

    // 选文明
    const pool = [...CIVS];
    // 把人类要选的放前面
    const human = pool.find(c => c.id === humanCivId) || pool[0];
    const ai = pool.filter(c => c.id !== human.id);
    // 打乱 AI
    for (let i = ai.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [ai[i], ai[j]] = [ai[j], ai[i]]; }

    const chosen = [human, ...ai].slice(0, numCivs);
    this.civs = chosen.map((c, idx) => ({
      ...c,
      isHuman: idx === 0,
      isDead: false,
      gold: 50,
      goldPerTurn: 0,
      science: 0, sciencePerTurn: 0,
      culture: 0, culturePerTurn: 0,
      faith: 0, faithPerTurn: 0,
      researching: null,    // tech id
      researched: new Set(),
      civicing: null,
      civicked: new Set(),
      relations: {},        // civId -> 'peace'|'war'|'denounced'
      knownCivs: new Set(),
      exploredTiles: new Set(),
      score: 0,
      era: 'ancient',
    }));

    // 关系初始化
    for (const a of this.civs) {
      for (const b of this.civs) if (b.id !== a.id) a.relations[b.id] = 'peace';
    }

    // 起点
    this.cities = [];
    this.units = [];
    const taken = [];
    for (const civ of this.civs) {
      const start = findStart(this.map, taken, this.rand);
      if (!start) continue;
      taken.push(start);
      // 给一个开拓者 + 一个勇士
      this.spawnUnit(civ.id, 'settler', start.q, start.r);
      const adj = hexNeighbors(start.q, start.r).find(n => {
        const t = this.map.tiles.get(hexKey(n.q, n.r));
        return t && TERRAINS[t.terrain].passable && !this.unitAt(n.q, n.r);
      });
      if (adj) this.spawnUnit(civ.id, 'warrior', adj.q, adj.r);
      // 侦察兵
      const adj2 = hexNeighbors(start.q, start.r).find(n => {
        const t = this.map.tiles.get(hexKey(n.q, n.r));
        return t && TERRAINS[t.terrain].passable && !this.unitAt(n.q, n.r);
      });
      if (adj2) this.spawnUnit(civ.id, 'scout', adj2.q, adj2.r);
      // 初始视野
      this.refreshVisibility(civ);
    }
  }

  humanCiv() { return this.civs.find(c => c.isHuman); }

  // ---- 实体查询 ----
  unitAt(q, r) { return this.units.find(u => u.q === q && u.r === r); }
  cityAt(q, r) { return this.cities.find(c => c.q === q && c.r === r); }
  civById(id) { return this.civs.find(c => c.id === id); }

  spawnUnit(civId, type, q, r) {
    const U = UNITS[type];
    const u = {
      id: nextId(), civId, type, q, r,
      hp: U.hp, maxHp: U.hp,
      movesLeft: U.moves,
      maxMoves: U.moves,
      fortified: 0,
      charges: U.charges,
      buildingImpr: null,    // {type, turnsLeft}
    };
    this.units.push(u);
    return u;
  }

  removeUnit(u) {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
  }

  // ---- 视野 ----
  visibleTilesFor(civ) {
    const vis = new Set();
    for (const u of this.units) {
      if (u.civId !== civ.id) continue;
      const U = UNITS[u.type];
      for (const t of hexesInRange({ q: u.q, r: u.r }, U.sight)) {
        vis.add(hexKey(t.q, t.r));
      }
    }
    for (const c of this.cities) {
      if (c.civId !== civ.id) continue;
      for (const t of hexesInRange({ q: c.q, r: c.r }, 3)) vis.add(hexKey(t.q, t.r));
    }
    return vis;
  }
  refreshVisibility(civ) {
    const v = this.visibleTilesFor(civ);
    for (const k of v) civ.exploredTiles.add(k);
  }

  // ---- 寻路 ----
  passableFor(unit, tile) {
    if (!tile) return false;
    const T = TERRAINS[tile.terrain];
    if (!T.passable) return false;
    // 同格其他单位（同阵营平民+军事可叠加，简化为：同阵营不允许重叠）
    const other = this.unitAt(tile.q, tile.r);
    if (other && other.id !== unit.id) return false;
    return true;
  }
  moveCost(tile) {
    return TERRAINS[tile.terrain].moveCost;
  }

  // BFS 在 movesLeft 内的可达
  reachableTiles(unit) {
    const out = new Map(); // key -> {cost, from}
    const start = hexKey(unit.q, unit.r);
    out.set(start, { cost: 0, from: null });
    const Q = [{ q: unit.q, r: unit.r, cost: 0 }];
    while (Q.length) {
      Q.sort((a, b) => a.cost - b.cost);
      const cur = Q.shift();
      for (const nb of hexNeighbors(cur.q, cur.r)) {
        const nbTile = this.map.tiles.get(hexKey(nb.q, nb.r));
        if (!this.passableFor(unit, nbTile)) continue;
        const c = cur.cost + this.moveCost(nbTile);
        if (c > unit.movesLeft) continue;
        const k = hexKey(nb.q, nb.r);
        if (out.has(k) && out.get(k).cost <= c) continue;
        out.set(k, { cost: c, from: hexKey(cur.q, cur.r) });
        Q.push({ q: nb.q, r: nb.r, cost: c });
      }
    }
    out.delete(start);
    return out;
  }

  // 攻击范围内的敌方目标格子
  attackableTiles(unit) {
    const U = UNITS[unit.type];
    const out = new Set();
    if (U.type !== 'military') return out;
    if (U.ranged) {
      for (const t of hexesInRange({ q: unit.q, r: unit.r }, U.range)) {
        const tile = this.map.tiles.get(hexKey(t.q, t.r));
        if (!tile) continue;
        if (hexDistance({ q: unit.q, r: unit.r }, t) === 0) continue;
        const enemyU = this.unitAt(t.q, t.r);
        const enemyC = this.cityAt(t.q, t.r);
        if (enemyU && this.areAtWar(unit.civId, enemyU.civId)) out.add(hexKey(t.q, t.r));
        else if (enemyC && this.areAtWar(unit.civId, enemyC.civId)) out.add(hexKey(t.q, t.r));
      }
    } else {
      // 近战：相邻
      for (const nb of hexNeighbors(unit.q, unit.r)) {
        const enemyU = this.unitAt(nb.q, nb.r);
        const enemyC = this.cityAt(nb.q, nb.r);
        if (enemyU && this.areAtWar(unit.civId, enemyU.civId)) out.add(hexKey(nb.q, nb.r));
        else if (enemyC && this.areAtWar(unit.civId, enemyC.civId)) out.add(hexKey(nb.q, nb.r));
      }
    }
    return out;
  }

  areAtWar(a, b) {
    if (a === b) return false;
    const ca = this.civById(a);
    if (!ca) return false;
    return ca.relations[b] === 'war';
  }

  // ---- 单位行动 ----
  moveUnit(unit, q, r) {
    const reach = this.reachableTiles(unit);
    const k = hexKey(q, r);
    if (!reach.has(k)) return false;
    const info = reach.get(k);
    unit.q = q; unit.r = r;
    unit.movesLeft = Math.max(0, unit.movesLeft - info.cost);
    unit.fortified = 0;
    const civ = this.civById(unit.civId);
    if (civ) this.refreshVisibility(civ);
    // 触发与其他文明的初次接触
    if (civ) {
      const vis = this.visibleTilesFor(civ);
      for (const u2 of this.units) {
        if (u2.civId === civ.id) continue;
        if (vis.has(hexKey(u2.q, u2.r))) {
          if (!civ.knownCivs.has(u2.civId)) {
            civ.knownCivs.add(u2.civId);
            const ov = this.civById(u2.civId);
            if (ov) ov.knownCivs.add(civ.id);
            if (civ.isHuman) this.notify(`遇见了${ov.name}（${ov.leader}）`, 'good');
          }
        }
      }
      for (const c2 of this.cities) {
        if (c2.civId === civ.id) continue;
        if (vis.has(hexKey(c2.q, c2.r))) {
          if (!civ.knownCivs.has(c2.civId)) {
            civ.knownCivs.add(c2.civId);
            const ov = this.civById(c2.civId);
            if (ov) ov.knownCivs.add(civ.id);
            if (civ.isHuman) this.notify(`发现了${ov.name}的城市：${c2.name}`, 'good');
          }
        }
      }
    }
    return true;
  }

  // 单位攻击：返回 {result, attackerDmg, defenderDmg}
  attack(attacker, q, r) {
    const U = UNITS[attacker.type];
    if (!this.attackableTiles(attacker).has(hexKey(q, r))) return null;
    if (attacker.movesLeft <= 0) return null;
    const defenderU = this.unitAt(q, r);
    const defenderC = this.cityAt(q, r);

    let aAtk = U.atk;
    // 民族主义 +5
    const ac = this.civById(attacker.civId);
    if (ac.civicked.has('nationalism')) aAtk += 5;
    if (attacker.fortified) aAtk += 3;

    let dDef, dHp, dMaxHp;
    let targetLabel = '';
    if (defenderU) {
      const DU = UNITS[defenderU.type];
      dDef = DU.def;
      const dc = this.civById(defenderU.civId);
      if (dc.civicked.has('nationalism')) dDef += 5;
      if (defenderU.fortified) dDef += 3;
      const dTile = this.map.tiles.get(hexKey(q, r));
      if (dTile && (dTile.terrain === 'hill' || dTile.terrain === 'forest' || dTile.terrain === 'jungle')) dDef += 4;
      dHp = defenderU.hp; dMaxHp = DU.hp;
      targetLabel = DU.name;
    } else if (defenderC) {
      dDef = 20 + Math.floor(defenderC.pop * 1.5);
      // 城防建筑
      if (defenderC.buildings.has('walls')) dDef += BUILDINGS.walls.defense;
      if (defenderC.buildings.has('barracks')) dDef += BUILDINGS.barracks.defense;
      dHp = defenderC.hp; dMaxHp = defenderC.maxHp;
      targetLabel = `${defenderC.name}(城市)`;
    } else {
      return null;
    }

    // 伤害公式：基于 atk vs def 比值
    const ratio = aAtk / Math.max(1, dDef);
    let dmgToDef = Math.round(28 * Math.pow(ratio, 1.2));
    let dmgToAtk = Math.round(22 * Math.pow(1 / Math.max(0.4, ratio), 1.1));
    if (U.ranged) dmgToAtk = 0; // 远程不受反击（简化）
    dmgToDef = Math.max(1, Math.min(80, dmgToDef));
    dmgToAtk = Math.max(0, Math.min(80, dmgToAtk));

    if (defenderU) defenderU.hp -= dmgToDef;
    if (defenderC) defenderC.hp -= dmgToDef;
    attacker.hp -= dmgToAtk;
    attacker.movesLeft = 0;
    attacker.fortified = 0;

    let result = 'ongoing';
    if (defenderU && defenderU.hp <= 0) {
      this.removeUnit(defenderU);
      result = 'killed';
      // 近战胜利：占领位置
      if (!U.ranged && (!defenderC || defenderC.hp > 0)) {
        attacker.q = q; attacker.r = r;
      }
    }
    if (defenderC && defenderC.hp <= 0) {
      // 攻城：近战才能占领
      if (!U.ranged && attacker.hp > 0) {
        this.captureCity(defenderC, attacker.civId);
        attacker.q = q; attacker.r = r;
        result = 'captured';
      } else {
        defenderC.hp = 1; // 远程打不下，留一血
        result = 'siege';
      }
    }
    if (attacker.hp <= 0) {
      this.removeUnit(attacker);
      result = 'attacker_dead';
    }
    // 视野更新
    this.refreshVisibility(this.civById(attacker.civId));
    // 通知
    if (this.humanCiv().id === attacker.civId) {
      if (result === 'killed') this.notify(`击败了${targetLabel}！`, 'good');
      else if (result === 'captured') this.notify(`占领了${targetLabel}！`, 'good');
      else if (result === 'attacker_dead') this.notify(`部队全军覆没…`, 'bad');
    } else if (defenderU && this.humanCiv().id === defenderU.civId) {
      this.notify(`一支部队被攻击！`, 'warn');
    } else if (defenderC && this.humanCiv().id === defenderC.civId) {
      this.notify(`${defenderC.name}遭到攻击！`, 'warn');
      if (result === 'captured') this.notify(`${defenderC.name}沦陷！`, 'bad');
    }
    return { result, dmgToDef, dmgToAtk };
  }

  // ---- 城市 ----
  cityName(civId) {
    const names = CITY_NAMES[civId] || ['城市'];
    this.cityCounter[civId] = (this.cityCounter[civId] || 0);
    const idx = this.cityCounter[civId]++;
    if (idx < names.length) return names[idx];
    return `${names[0]}${idx + 1}`;
  }

  foundCity(unit) {
    if (unit.type !== 'settler') return false;
    const tile = this.map.tiles.get(hexKey(unit.q, unit.r));
    if (!tile) return false;
    if (this.cityAt(unit.q, unit.r)) return false;
    if (!TERRAINS[tile.terrain].passable) return false;
    // 至少离已有城市 3 格
    if (this.cities.some(c => hexDistance({ q: c.q, r: c.r }, unit) < 3)) {
      this.notify('离其他城市太近，无法建城。', 'warn');
      return false;
    }
    const civ = this.civById(unit.civId);
    const city = {
      id: nextId(), civId: civ.id, q: unit.q, r: unit.r,
      name: this.cityName(civ.id),
      pop: 1, food: 0, foodNext: 20,
      prod: 0,
      hp: 100, maxHp: 100,
      production: null,    // {kind:'unit'|'building', id, prog}
      queue: [],
      buildings: new Set(['palace_implicit']),
      workedTiles: new Set(),  // hexKey
      turnsAlive: 0,
    };
    // 起步分配 3 格临近
    const ring = hexesInRange({ q: city.q, r: city.r }, 1).filter(t => hexKey(t.q, t.r) !== hexKey(city.q, city.r));
    for (const t of ring) {
      const tile2 = this.map.tiles.get(hexKey(t.q, t.r));
      if (!tile2) continue;
      tile2.owner = civ.id;
    }
    const center = this.map.tiles.get(hexKey(city.q, city.r));
    if (center) center.owner = civ.id;
    this.cities.push(city);
    this.removeUnit(unit);
    this.refreshVisibility(civ);
    if (civ.isHuman) this.notify(`建立城市：${city.name}`, 'good');
    return true;
  }

  captureCity(city, newOwnerId) {
    const old = this.civById(city.civId);
    const newOwner = this.civById(newOwnerId);
    if (!newOwner) return;
    city.civId = newOwnerId;
    city.hp = Math.max(20, Math.floor(city.maxHp * 0.3));
    city.pop = Math.max(1, city.pop - 1);
    // 把领土改色
    for (const t of this.map.tiles.values()) if (t.owner === old?.id) {
      // 仅改这座城周围 2 圈
      if (hexDistance({ q: t.q, r: t.r }, city) <= 2) t.owner = newOwnerId;
    }
    // 老主人是否死亡
    if (old) {
      const remain = this.cities.filter(c => c.civId === old.id).length;
      if (remain === 0) {
        old.isDead = true;
        // 老主人单位也消失
        this.units = this.units.filter(u => u.civId !== old.id);
        this.notify(`${old.name}文明灭亡！`, 'good');
      }
    }
  }

  // 城市每回合产出
  cityYields(city) {
    const out = { food: 0, prod: 0, gold: 0, sci: 0, cult: 0, faith: 0 };
    const center = this.map.tiles.get(hexKey(city.q, city.r));
    if (center) {
      const y = tileYield(center);
      for (const k in y) out[k] = (out[k] || 0) + y[k];
    }
    // 工作格 = 人口数
    const candidates = hexesInRange({ q: city.q, r: city.r }, 3)
      .map(t => this.map.tiles.get(hexKey(t.q, t.r)))
      .filter(t => t && t.owner === city.civId && (t.q !== city.q || t.r !== city.r));
    // 简单：按 food+prod+gold 排序，取前 pop 个
    candidates.sort((a, b) => {
      const ya = tileYield(a), yb = tileYield(b);
      return (yb.food*2 + yb.prod*1.5 + yb.gold) - (ya.food*2 + ya.prod*1.5 + ya.gold);
    });
    const worked = candidates.slice(0, city.pop);
    city.workedTiles = new Set(worked.map(t => hexKey(t.q, t.r)));
    for (const t of worked) {
      const y = tileYield(t);
      for (const k in y) out[k] = (out[k] || 0) + y[k];
    }
    // 城市基础
    out.sci += 1 + Math.floor(city.pop / 2);
    out.cult += 1;
    out.gold += 2;
    // 建筑
    const civ = this.civById(city.civId);
    for (const b of city.buildings) {
      const B = BUILDINGS[b];
      if (!B) continue;
      for (const k in B.yield || {}) out[k] = (out[k] || 0) + B.yield[k];
      out.gold -= (B.maint || 0);
    }
    // 市政加成
    if (civ.civicked.has('craftsman')) out.prod += 1;
    if (civ.civicked.has('state_workforce')) out.prod += 2;
    if (civ.civicked.has('mysticism')) out.faith += 1;
    if (civ.civicked.has('recorded')) out.cult += 2;
    if (civ.civicked.has('guilds')) out.gold += 2;
    if (civ.civicked.has('enlightenment')) out.sci += 2;
    return out;
  }

  // 食物消耗 = 人口 * 2
  cityNetFood(city) {
    const y = this.cityYields(city);
    return y.food - city.pop * 2;
  }

  // 推进生产
  advanceProduction(city, prodAmount) {
    if (!city.production) {
      if (city.queue.length) city.production = city.queue.shift();
    }
    if (!city.production) return;
    city.production.prog += prodAmount;
    const item = city.production;
    let needed;
    if (item.kind === 'unit') needed = UNITS[item.id].cost;
    else if (item.kind === 'building') needed = BUILDINGS[item.id].cost;
    else needed = 99999;
    if (city.production.prog >= needed) {
      this.completeProduction(city, item);
      city.production = null;
    }
  }
  completeProduction(city, item) {
    const civ = this.civById(city.civId);
    if (item.kind === 'unit') {
      // 找一个空地放
      const spots = [{ q: city.q, r: city.r }, ...hexNeighbors(city.q, city.r)];
      const free = spots.find(s => {
        const t = this.map.tiles.get(hexKey(s.q, s.r));
        return t && TERRAINS[t.terrain].passable && !this.unitAt(s.q, s.r);
      });
      const loc = free || { q: city.q, r: city.r };
      this.spawnUnit(civ.id, item.id, loc.q, loc.r);
      if (civ.isHuman) this.notify(`${city.name} 完成 ${UNITS[item.id].name}`, 'good');
    } else if (item.kind === 'building') {
      city.buildings.add(item.id);
      if (civ.isHuman) this.notify(`${city.name} 完成 ${BUILDINGS[item.id].name}`, 'good');
    }
  }

  // 文明每回合
  endTurn() {
    if (this.gameOver) return;
    // 在收益前，先给每个 AI 选好研究/市政（否则第一次收益时科技不累加）
    for (const civ of this.civs) {
      if (civ.isDead || civ.isHuman) continue;
      if (!civ.researching) civ.researching = this.aiPickTech(civ);
      if (!civ.civicing) civ.civicing = this.aiPickCivic(civ);
    }
    // 人类先 commit；这里直接走全文明
    // 1) 收益
    for (const civ of this.civs) {
      if (civ.isDead) continue;
      let gpt = 0, spt = 0, cpt = 0, fpt = 0;
      let owned = this.cities.filter(c => c.civId === civ.id);
      for (const city of owned) {
        const y = this.cityYields(city);
        gpt += y.gold; spt += y.sci; cpt += y.cult; fpt += y.faith;
        // 食物
        city.food += this.cityNetFood(city);
        if (city.food < 0) {
          // 饥荒
          if (city.pop > 1) {
            city.pop--;
            city.food = 0;
            if (civ.isHuman) this.notify(`${city.name} 饥荒，人口 -1`, 'bad');
          } else city.food = 0;
        }
        if (city.food >= city.foodNext) {
          city.food -= city.foodNext;
          city.pop++;
          city.foodNext = Math.floor(20 + 8 * city.pop * city.pop);
          // 扩大边界：把最近的非领土格收入
          this.expandBorder(city);
          if (civ.isHuman) this.notify(`${city.name} 人口增长到 ${city.pop}`, 'good');
        }
        // 生产
        this.advanceProduction(city, y.prod);
        // 自然回血
        if (city.hp < city.maxHp) city.hp = Math.min(city.maxHp, city.hp + 5);
        city.turnsAlive++;
      }
      // 单位维护
      let maint = 0;
      for (const u of this.units) if (u.civId === civ.id) maint += (UNITS[u.type].maint || 0);
      if (civ.civicked.has('feudalism')) maint = Math.max(0, maint - owned.length);
      gpt -= maint;
      civ.goldPerTurn = gpt; civ.sciencePerTurn = spt;
      civ.culturePerTurn = cpt; civ.faithPerTurn = fpt;
      civ.gold += gpt;
      if (civ.gold < 0) {
        // 破产：解散一个单位
        const milits = this.units.filter(u => u.civId === civ.id && UNITS[u.type].type === 'military');
        if (milits.length) {
          this.removeUnit(milits[0]);
          civ.gold = 0;
          if (civ.isHuman) this.notify(`金币耗尽，单位被遣散`, 'bad');
        } else civ.gold = 0;
      }
      // 科技
      if (civ.researching) {
        civ.science += spt;
        const T = TECHS[civ.researching];
        if (T && civ.science >= T.cost) {
          civ.researched.add(civ.researching);
          civ.science -= T.cost;
          if (civ.isHuman) this.notify(`研究完成：${T.name}`, 'good');
          const done = civ.researching;
          civ.researching = null;
          // 时代推进
          this.updateEra(civ);
          // 胜利检查
          if (done === 'space_flight') this.declareVictory(civ, 'science');
        }
      }
      if (civ.civicing) {
        civ.culture += cpt;
        const C = CIVICS[civ.civicing];
        if (C && civ.culture >= C.cost) {
          civ.civicked.add(civ.civicing);
          civ.culture -= C.cost;
          if (civ.isHuman) this.notify(`市政完成：${C.name}`, 'good');
          const done = civ.civicing;
          civ.civicing = null;
          if (done === 'globalization') this.declareVictory(civ, 'culture');
        }
      }
    }
    // 2) 单位刷行动力 + 工人施工 + 治疗
    for (const u of this.units) {
      const U = UNITS[u.type];
      u.movesLeft = u.maxMoves;
      if (U.hp > 0 && u.hp < U.hp) {
        u.hp = Math.min(U.hp, u.hp + (u.fortified ? 12 : 8));
      }
      if (u.fortified > 0) u.fortified++;
      if (u.buildingImpr) {
        u.buildingImpr.turnsLeft--;
        if (u.buildingImpr.turnsLeft <= 0) {
          const tile = this.map.tiles.get(hexKey(u.q, u.r));
          if (tile) {
            const imp = IMPROVEMENTS[u.buildingImpr.type];
            tile.improvement = { type: u.buildingImpr.type, name: imp.name, yield: imp.yield };
            if (this.civById(u.civId).isHuman) this.notify(`${imp.name}建造完成`, 'good');
          }
          u.buildingImpr = null;
          u.charges = Math.max(0, (u.charges || 1) - 1);
          if (u.charges <= 0) this.removeUnit(u);
        }
      }
    }
    // 3) AI 决策
    for (const civ of this.civs) {
      if (civ.isDead || civ.isHuman) continue;
      this.aiTakeTurn(civ);
    }
    // 4) 胜利判定
    this.checkVictories();
    // 5) 视野
    for (const civ of this.civs) if (!civ.isDead) this.refreshVisibility(civ);
    // 6) 评分
    for (const civ of this.civs) civ.score = this.computeScore(civ);
    this.turn++;
  }

  expandBorder(city) {
    const ring = hexesInRange({ q: city.q, r: city.r }, 4);
    let best = null, bestScore = -1;
    for (const t of ring) {
      const tile = this.map.tiles.get(hexKey(t.q, t.r));
      if (!tile) continue;
      if (tile.owner != null) continue;
      if (TERRAINS[tile.terrain].naval && hexDistance({ q: city.q, r: city.r }, t) > 2) continue;
      const y = tileYield(tile);
      const dist = hexDistance({ q: city.q, r: city.r }, t);
      const sc = (y.food + y.prod + y.gold) - dist;
      if (sc > bestScore) { bestScore = sc; best = tile; }
    }
    if (best) best.owner = city.civId;
  }

  updateEra(civ) {
    const eras = ['ancient','classical','medieval','renaissance','industrial','modern','atomic'];
    let era = 'ancient';
    let counts = { ancient: 0, classical: 0, medieval: 0, renaissance: 0, industrial: 0, modern: 0, atomic: 0 };
    for (const t of civ.researched) counts[TECHS[t].era] = (counts[TECHS[t].era] || 0) + 1;
    for (let i = eras.length - 1; i >= 0; i--) if (counts[eras[i]] >= 1) { era = eras[i]; break; }
    civ.era = era;
  }

  computeScore(civ) {
    let s = 0;
    s += this.cities.filter(c => c.civId === civ.id).length * 50;
    s += this.cities.filter(c => c.civId === civ.id).reduce((a, c) => a + c.pop * 5, 0);
    s += civ.researched.size * 8;
    s += civ.civicked.size * 6;
    return s;
  }

  checkVictories() {
    if (this.gameOver) return;
    // 征服：只剩 1 个文明
    const alive = this.civs.filter(c => !c.isDead);
    if (alive.length === 1) {
      this.declareVictory(alive[0], 'domination'); return;
    }
    // 分数：1000 分获胜
    for (const c of alive) if (this.computeScore(c) >= 1500) {
      this.declareVictory(c, 'score'); return;
    }
    // 回合 300 后按分数定胜
    if (this.turn >= 300) {
      const sorted = [...alive].sort((a, b) => this.computeScore(b) - this.computeScore(a));
      this.declareVictory(sorted[0], 'time');
    }
  }

  declareVictory(civ, type) {
    if (this.gameOver) return;
    this.gameOver = { winner: civ.id, type };
    const human = this.humanCiv();
    if (civ.id === human.id) this.notify(`${{
      science: '科技', culture: '文化', domination: '征服', score: '分数', time: '时代终结'
    }[type]}胜利！`, 'good');
    else this.notify(`${civ.name} 取得了${{
      science: '科技', culture: '文化', domination: '征服', score: '分数', time: '时代终结'
    }[type]}胜利`, 'bad');
  }

  notify(msg, level = '') {
    this.notifications.unshift({ turn: this.turn, msg, level });
    if (this.notifications.length > 40) this.notifications.length = 40;
  }

  // ---- 序列化 ----
  serialize() {
    return {
      seed: this.seed,
      turn: this.turn,
      gameOver: this.gameOver,
      cityCounter: this.cityCounter,
      notifications: this.notifications.slice(0, 20),
      civs: this.civs.map(c => ({
        ...c,
        researched: [...c.researched],
        civicked: [...c.civicked],
        knownCivs: [...c.knownCivs],
        exploredTiles: [...c.exploredTiles],
      })),
      cities: this.cities.map(c => ({ ...c, buildings: [...c.buildings], workedTiles: [...c.workedTiles] })),
      units: this.units,
      tiles: [...this.map.tiles.values()].map(t => ({
        q: t.q, r: t.r, terrain: t.terrain, resource: t.resource,
        improvement: t.improvement, owner: t.owner, road: t.road,
      })),
      mapRadius: this.map.radius,
    };
  }

  static deserialize(data) {
    const g = new Game({ seed: data.seed, numCivs: 1, mapRadius: data.mapRadius });
    // 覆盖
    g.turn = data.turn;
    g.gameOver = data.gameOver;
    g.cityCounter = data.cityCounter || {};
    g.notifications = data.notifications || [];
    g.civs = data.civs.map(c => ({
      ...c,
      researched: new Set(c.researched),
      civicked: new Set(c.civicked),
      knownCivs: new Set(c.knownCivs),
      exploredTiles: new Set(c.exploredTiles),
    }));
    g.cities = data.cities.map(c => ({ ...c, buildings: new Set(c.buildings), workedTiles: new Set(c.workedTiles) }));
    g.units = data.units;
    // 还原 tile 属性
    for (const t of data.tiles) {
      const real = g.map.tiles.get(hexKey(t.q, t.r));
      if (real) Object.assign(real, t);
    }
    // 重置 UID 让新单位 id 不冲突
    const maxId = Math.max(0, ...g.units.map(u => u.id), ...g.cities.map(c => c.id));
    UID = maxId + 1;
    return g;
  }

  // ---- AI（简单但完整：扩张/生产/研究/进攻）----
  aiTakeTurn(civ) {
    // 研究队列
    if (!civ.researching) civ.researching = this.aiPickTech(civ);
    if (!civ.civicing) civ.civicing = this.aiPickCivic(civ);

    // 城市生产
    for (const city of this.cities.filter(c => c.civId === civ.id)) {
      if (!city.production) city.production = this.aiPickProduction(civ, city);
    }
    // 单位
    for (const u of this.units.filter(u => u.civId === civ.id)) {
      if (u.movesLeft <= 0) continue;
      const U = UNITS[u.type];
      // 开拓者：找好位置建城
      if (u.type === 'settler') {
        const myCities = this.cities.filter(c => c.civId === civ.id);
        // 当前格能否直接建城？
        const here = this.map.tiles.get(hexKey(u.q, u.r));
        const hereOk = here && TERRAINS[here.terrain].passable &&
          !this.cities.some(c => hexDistance({q:c.q,r:c.r}, u) < 3);
        if (hereOk && (myCities.length === 0 || this.rand() < 0.7)) {
          if (this.foundCity(u)) continue;
        }
        const target = this.aiFindCitySite(u, myCities);
        if (target) {
          if (target.q === u.q && target.r === u.r) {
            this.foundCity(u);
          } else {
            this.aiMoveToward(u, target);
          }
        } else if (hereOk) {
          this.foundCity(u);
        } else {
          // 找不到合适目标 + 当前点也不行：随机走开
          const reach = this.game ? null : null;
          const nbs = hexNeighbors(u.q, u.r).filter(n => {
            const t = this.map.tiles.get(hexKey(n.q, n.r));
            return t && TERRAINS[t.terrain].passable && !this.unitAt(n.q, n.r);
          });
          if (nbs.length) {
            const pick = nbs[Math.floor(this.rand() * nbs.length)];
            this.moveUnit(u, pick.q, pick.r);
          }
        }
        continue;
      }
      // 工人：附近找改良
      if (u.type === 'worker') {
        if (u.buildingImpr) continue;
        const myTiles = [...this.map.tiles.values()].filter(t => t.owner === civ.id && !t.improvement && !this.cityAt(t.q, t.r));
        myTiles.sort((a, b) => hexDistance({q:a.q,r:a.r},u) - hexDistance({q:b.q,r:b.r},u));
        const t = myTiles[0];
        if (t) {
          if (t.q === u.q && t.r === u.r) {
            const opt = this.workerOptionsAt(u);
            if (opt.length) {
              u.buildingImpr = { type: opt[0].type, turnsLeft: 3 };
              u.movesLeft = 0;
            }
          } else this.aiMoveToward(u, t);
        }
        continue;
      }
      // 军事：找最近敌人或目标
      if (U.type === 'military') {
        const enemyU = this.units.filter(x => this.areAtWar(civ.id, x.civId));
        const enemyC = this.cities.filter(x => this.areAtWar(civ.id, x.civId));
        const targets = [...enemyU.map(x => ({q:x.q,r:x.r,kind:'u',ref:x})), ...enemyC.map(x => ({q:x.q,r:x.r,kind:'c',ref:x}))];
        // 防御 bias：留在最近自家城市附近
        const myCities = this.cities.filter(c => c.civId === civ.id);
        let target = null, bestD = 999;
        for (const t of targets) {
          const d = hexDistance({q:u.q,r:u.r}, t);
          if (d < bestD) { bestD = d; target = t; }
        }
        // 攻击/移动
        if (target) {
          const atk = this.attackableTiles(u);
          if (atk.has(hexKey(target.q, target.r))) {
            this.attack(u, target.q, target.r);
          } else {
            this.aiMoveToward(u, target);
          }
        } else if (civ.bias === 'war' && myCities.length) {
          // 巡逻
          this.aiMoveToward(u, myCities[0]);
        } else {
          // 探索：随便走
          const nbs = hexNeighbors(u.q, u.r).filter(n => {
            const t = this.map.tiles.get(hexKey(n.q, n.r));
            return t && TERRAINS[t.terrain].passable && !this.unitAt(n.q, n.r);
          });
          if (nbs.length) {
            const pick = nbs[Math.floor(this.rand() * nbs.length)];
            this.moveUnit(u, pick.q, pick.r);
          }
        }
        // 偶尔宣战
        if (civ.bias === 'war' && this.rand() < 0.005) {
          const target = this.civs.find(c => !c.isDead && c.id !== civ.id && civ.relations[c.id] === 'peace' && civ.knownCivs.has(c.id));
          if (target) this.declareWar(civ, target);
        }
        continue;
      }
      // 侦察：探索
      if (u.type === 'scout') {
        const nbs = hexNeighbors(u.q, u.r).filter(n => {
          const t = this.map.tiles.get(hexKey(n.q, n.r));
          if (!t || !TERRAINS[t.terrain].passable) return false;
          if (this.unitAt(n.q, n.r)) return false;
          return true;
        });
        if (nbs.length) {
          // 偏向未探索方向
          nbs.sort((a, b) => (civ.exploredTiles.has(hexKey(a.q,a.r))?1:0) - (civ.exploredTiles.has(hexKey(b.q,b.r))?1:0));
          this.moveUnit(u, nbs[0].q, nbs[0].r);
        }
      }
    }
  }

  declareWar(from, to) {
    from.relations[to.id] = 'war';
    to.relations[from.id] = 'war';
    from.knownCivs.add(to.id); to.knownCivs.add(from.id);
    if (this.humanCiv().id === to.id || this.humanCiv().id === from.id) {
      this.notify(`${from.name} 向 ${to.name} 宣战！`, 'bad');
    }
  }
  makePeace(a, b) {
    a.relations[b.id] = 'peace'; b.relations[a.id] = 'peace';
    if (this.humanCiv().id === a.id || this.humanCiv().id === b.id) this.notify(`${a.name} 与 ${b.name} 缔结和平`, 'good');
  }

  aiMoveToward(u, target) {
    const reach = this.reachableTiles(u);
    let best = null, bestD = hexDistance({q:u.q,r:u.r}, target);
    for (const [k, info] of reach) {
      const [q, r] = k.split(',').map(Number);
      const d = hexDistance({q,r}, target);
      if (d < bestD) { bestD = d; best = {q, r}; }
    }
    if (best) this.moveUnit(u, best.q, best.r);
  }

  aiFindCitySite(u, myCities) {
    // 在视野/已探索的格中找一个分高的
    const civ = this.civById(u.civId);
    const reach = this.reachableTiles(u);
    const cands = [];
    for (const t of this.map.tiles.values()) {
      const k = hexKey(t.q, t.r);
      if (!civ.exploredTiles.has(k)) continue;
      if (!TERRAINS[t.terrain].passable || t.terrain === 'mountain') continue;
      if (myCities.some(c => hexDistance({q:c.q,r:c.r}, t) < 4)) continue;
      if (this.cities.some(c => hexDistance({q:c.q,r:c.r}, t) < 4)) continue;
      let sc = 0;
      for (const n of hexesInRange({q:t.q,r:t.r}, 2)) {
        const nt = this.map.tiles.get(hexKey(n.q,n.r));
        if (!nt) continue;
        const y = tileYield(nt);
        sc += y.food + y.prod + y.gold;
      }
      sc -= hexDistance({q:u.q,r:u.r}, t) * 2;
      cands.push({ t, sc });
    }
    cands.sort((a, b) => b.sc - a.sc);
    return cands[0]?.t;
  }

  aiPickTech(civ) {
    const order = ['pottery','animal','mining','archery','writing','bronze_working','masonry','currency','horseback','iron_working','mathematics','education','chivalry','banking','gunpowder','industrial','flight','space_flight'];
    for (const t of order) {
      if (civ.researched.has(t)) continue;
      const T = TECHS[t];
      if (T.prereq.every(p => civ.researched.has(p))) return t;
    }
    return null;
  }
  aiPickCivic(civ) {
    const order = ['code_law','craftsman','early_empire','mysticism','state_workforce','political','recorded','feudalism','guilds','exploration','enlightenment','nationalism','globalization'];
    for (const t of order) {
      if (civ.civicked.has(t)) continue;
      const T = CIVICS[t];
      if (T.prereq.every(p => civ.civicked.has(p))) return t;
    }
    return null;
  }
  aiPickProduction(civ, city) {
    // 若敌对城市临近 → 出兵
    const threat = this.cities.some(c => this.areAtWar(civ.id, c.civId) && hexDistance(c, city) < 6);
    if (threat) {
      const opts = this.availableUnitsFor(civ).filter(t => UNITS[t].type === 'military');
      if (opts.length) return { kind: 'unit', id: opts[opts.length - 1], prog: 0 };
    }
    // 早期：开拓 + 建筑
    const myCities = this.cities.filter(c => c.civId === civ.id).length;
    const mySettlers = this.units.filter(u => u.civId === civ.id && u.type === 'settler').length;
    const expandCap = civ.bias === 'expand' ? 6 : 4;
    if (myCities < expandCap && mySettlers < 2 && city.pop >= 3) {
      return { kind: 'unit', id: 'settler', prog: 0 };
    }
    // 建筑
    const bopts = Object.keys(BUILDINGS).filter(b => {
      const B = BUILDINGS[b];
      if (city.buildings.has(b)) return false;
      if (B.tech && !civ.researched.has(B.tech)) return false;
      return true;
    });
    if (bopts.length) return { kind: 'building', id: bopts[0], prog: 0 };
    // 否则兵
    const milits = this.availableUnitsFor(civ).filter(t => UNITS[t].type === 'military');
    if (milits.length) return { kind: 'unit', id: milits[milits.length - 1], prog: 0 };
    return null;
  }

  availableUnitsFor(civ) {
    return Object.keys(UNITS).filter(u => {
      const U = UNITS[u];
      if (U.tech && !civ.researched.has(U.tech)) return false;
      return true;
    });
  }

  // 工人当前格可建什么
  workerOptionsAt(worker) {
    const tile = this.map.tiles.get(hexKey(worker.q, worker.r));
    if (!tile) return [];
    if (tile.improvement) return [];
    if (tile.owner !== worker.civId) return [];
    const civ = this.civById(worker.civId);
    const out = [];
    for (const [k, imp] of Object.entries(IMPROVEMENTS)) {
      if (!imp.terrain.includes(tile.terrain)) continue;
      if (imp.needsRes && !imp.needsRes.includes(tile.resource)) continue;
      // 必须有对应科技（简化：mining→mine, animal→pasture）
      if (k === 'mine' && !civ.researched.has('mining')) continue;
      if (k === 'pasture' && !civ.researched.has('animal')) continue;
      out.push({ type: k, name: imp.name });
    }
    return out;
  }
}
