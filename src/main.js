"use strict";

(() => {
  const W = 15;
  const H = 10;
  const MAX_TURN = 90;
  const SAVE_KEY = "hex-dominion-save-v2";
  const SQRT3 = Math.sqrt(3);

  const TERRAIN = {
    coast: { name: "Coast", color: "#3c7d8a", edge: "#285b66", pass: false, water: true, y: [1, 0, 0, 0, 1] },
    grass: { name: "Grassland", color: "#4f8f58", edge: "#386a40", pass: true, y: [2, 0, 0, 0, 0] },
    plains: { name: "Plains", color: "#a58a47", edge: "#75602f", pass: true, y: [1, 1, 0, 0, 0] },
    forest: { name: "Forest", color: "#2d744b", edge: "#1e5234", pass: true, rough: true, y: [1, 2, 0, 0, 0] },
    hills: { name: "Hills", color: "#7a745e", edge: "#5b5647", pass: true, rough: true, y: [0, 2, 0, 0, 0] },
    desert: { name: "Desert", color: "#c0a66a", edge: "#8c7448", pass: true, y: [0, 1, 0, 0, 0] },
    tundra: { name: "Tundra", color: "#83958e", edge: "#65716c", pass: true, y: [1, 0, 0, 0, 0] },
    mountain: { name: "Mountain", color: "#8e9191", edge: "#6f7375", pass: false, y: [0, 0, 1, 0, 0] },
  };

  const RES = {
    wheat: { name: "Wheat", short: "Wh", y: [2, 0, 0, 0, 0] },
    iron: { name: "Iron", short: "Ir", y: [0, 2, 0, 0, 0] },
    horses: { name: "Horses", short: "Ho", y: [0, 1, 0, 0, 1] },
    fish: { name: "Fish", short: "Fi", y: [2, 0, 0, 0, 1] },
    silk: { name: "Silk", short: "Si", y: [0, 0, 0, 1, 2] },
    gold: { name: "Gold", short: "Au", y: [0, 0, 0, 0, 3] },
    stone: { name: "Stone", short: "St", y: [0, 2, 0, 0, 0] },
  };

  const IMP = {
    farm: { name: "Farm", terrain: ["grass", "plains"], y: [1, 0, 0, 0, 0] },
    mine: { name: "Mine", terrain: ["hills", "desert", "tundra"], y: [0, 1, 0, 0, 0] },
    camp: { name: "Camp", terrain: ["forest", "plains", "grass"], y: [0, 0, 0, 0, 1] },
  };

  const UNITS = {
    settler: { name: "Settler", short: "S", cost: 65, moves: 2, power: 5, vision: 2, civilian: true },
    warrior: { name: "Warrior", short: "W", cost: 40, moves: 2, power: 20, vision: 2 },
    scout: { name: "Scout", short: "Sc", cost: 30, moves: 3, power: 10, vision: 3 },
    builder: { name: "Builder", short: "B", cost: 45, moves: 2, power: 5, vision: 2, charges: 3, civilian: true },
    archer: { name: "Archer", short: "A", cost: 60, moves: 2, power: 24, vision: 2, tech: "archery" },
    spearman: { name: "Spearman", short: "Sp", cost: 62, moves: 2, power: 28, vision: 2, tech: "bronze" },
  };

  const BUILDINGS = {
    granary: { name: "Granary", cost: 55, tech: "pottery", y: [2, 0, 0, 0, 0] },
    monument: { name: "Monument", cost: 45, civic: "code", y: [0, 0, 0, 2, 0] },
    library: { name: "Library", cost: 75, tech: "writing", y: [0, 0, 3, 0, 0] },
    walls: { name: "Walls", cost: 70, tech: "engineering", y: [0, 0, 0, 0, 0], defense: 35 },
    market: { name: "Market", cost: 90, civic: "currency", y: [0, 0, 0, 0, 4] },
    academy: { name: "Academy", cost: 145, tech: "education", y: [0, 0, 6, 1, 0], victory: true },
  };

  const TECHS = [
    ["pottery", "Pottery", 12, "Unlocks Granary."],
    ["mining", "Mining", 16, "Mines add production."],
    ["archery", "Archery", 24, "Unlocks Archer."],
    ["writing", "Writing", 28, "Unlocks Library."],
    ["bronze", "Bronze Working", 34, "Unlocks Spearman."],
    ["engineering", "Engineering", 48, "Unlocks Walls."],
    ["education", "Education", 72, "Unlocks Academy."],
  ];

  const CIVICS = [
    ["code", "Code of Laws", 10, "Unlocks Monument."],
    ["craft", "Craftsmanship", 18, "Builders improve tiles."],
    ["empire", "Early Empire", 26, "Settlers are cheaper."],
    ["workforce", "State Workforce", 36, "Cities gain production."],
    ["currency", "Currency", 48, "Unlocks Market."],
    ["drama", "Drama and Poetry", 58, "Culture pressure rises."],
  ];

  const NAMES = {
    player: ["Aster", "Lumen", "Viridian", "Northgate", "Sunwell"],
    ai: ["Kharos", "Vey", "Redspire", "Ash Gate", "Ebonhold"],
  };

  const $ = (id) => document.getElementById(id);
  const dom = {
    canvas: $("mapCanvas"),
    yieldBar: $("yieldBar"),
    selection: $("selectionPanel"),
    research: $("researchPanel"),
    empire: $("empirePanel"),
    production: $("productionPanel"),
    log: $("eventLog"),
    actions: $("actionBar"),
    turn: $("turnPill"),
    hint: $("hintPill"),
    endTurn: $("endTurnButton"),
    newGame: $("newGameButton"),
    save: $("saveGameButton"),
    clear: $("clearLogButton"),
    modal: $("gameModal"),
    modalEyebrow: $("modalEyebrow"),
    modalTitle: $("modalTitle"),
    modalBody: $("modalBody"),
    modalClose: $("modalCloseButton"),
    modalRestart: $("modalRestartButton"),
  };

  const ctx = dom.canvas.getContext("2d");
  let g;
  let layout;
  let hover = null;
  let tick = 0;

  function rng(seed) {
    let n = seed >>> 0;
    return () => {
      n += 0x6d2b79f5;
      let t = n;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function key(q, r) {
    return q + "," + r;
  }

  function tile(q, r) {
    return g.map[key(q, r)] || null;
  }

  function dirs(q) {
    return q % 2 === 0
      ? [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]]
      : [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  }

  function neighbors(t) {
    return dirs(t.q).map((d) => tile(t.q + d[0], t.r + d[1])).filter(Boolean);
  }

  function cube(t) {
    const x = t.q;
    const z = t.r - (t.q - (t.q & 1)) / 2;
    return { x, y: -x - z, z };
  }

  function dist(a, b) {
    const A = cube(a);
    const B = cube(b);
    return Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z));
  }

  function add(a, b) {
    for (let i = 0; i < 5; i += 1) a[i] += b[i] || 0;
    return a;
  }

  function yields(t) {
    const y = [...TERRAIN[t.terrain].y];
    if (t.resource) add(y, RES[t.resource].y);
    if (t.improvement) add(y, IMP[t.improvement].y);
    return y;
  }

  function score(y) {
    return y[0] * 1.2 + y[1] * 1.4 + y[2] * 1.1 + y[3] + y[4] * 0.7;
  }

  function player(id, name, color) {
    return {
      id,
      name,
      color,
      gold: id === "player" ? 40 : 30,
      science: 0,
      culture: 0,
      techs: [],
      civics: [],
      tp: {},
      cp: {},
      tech: TECHS[0][0],
      civic: CIVICS[0][0],
      nameIndex: 0,
    };
  }

  function makeMap(seed) {
    const rand = rng(seed);
    const tiles = [];
    const map = {};
    for (let q = 0; q < W; q += 1) {
      for (let r = 0; r < H; r += 1) {
        const edge = Math.min(q, r, W - 1 - q, H - 1 - r);
        const temp = r / (H - 1) + (rand() - 0.5) * 0.25;
        const wet = rand();
        const elev = 0.55 + (rand() - 0.5) * 0.65 - (edge < 1 ? 0.55 : edge === 1 ? 0.18 : 0);
        let terrain = "plains";
        if (elev < 0.22) terrain = "coast";
        else if (elev > 1.02) terrain = "mountain";
        else if (elev > 0.82) terrain = "hills";
        else if (temp < 0.18) terrain = wet > 0.55 ? "forest" : "tundra";
        else if (temp > 0.78 && wet < 0.36) terrain = "desert";
        else if (wet > 0.68) terrain = "forest";
        else if (wet > 0.46) terrain = "grass";
        const t = { q, r, terrain, resource: null, improvement: null, city: null, units: [], owner: null, seen: false, visible: false, c: {}, poly: [] };
        tiles.push(t);
        map[key(q, r)] = t;
      }
    }
    g = { tiles, map };
    for (const t of tiles) t.resource = resourceFor(t, rand);
    return { tiles, map };
  }

  function resourceFor(t, rand) {
    if (t.terrain === "coast") return rand() < 0.16 ? "fish" : null;
    if (t.terrain === "mountain") return rand() < 0.1 ? "gold" : null;
    if (rand() > 0.16) return null;
    if (t.terrain === "grass") return rand() < 0.6 ? "wheat" : "horses";
    if (t.terrain === "plains") return rand() < 0.5 ? "wheat" : "horses";
    if (t.terrain === "forest") return rand() < 0.5 ? "silk" : "stone";
    if (t.terrain === "hills") return rand() < 0.6 ? "iron" : "stone";
    if (t.terrain === "desert") return rand() < 0.55 ? "gold" : "stone";
    return rand() < 0.45 ? "iron" : null;
  }

  function newGame() {
    const seed = Math.floor(Math.random() * 9999999);
    const made = makeMap(seed);
    g = {
      seed,
      turn: 1,
      phase: "player",
      tiles: made.tiles,
      map: made.map,
      players: {
        player: player("player", "Aurora Accord", "#4f8fff"),
        ai: player("ai", "Crimson Compact", "#d45d53"),
      },
      units: [],
      cities: [],
      selected: null,
      unitId: 1,
      cityId: 1,
      log: [],
      winner: null,
    };
    const ps = startTile("player");
    const as = startTile("ai");
    makeCity("player", ps, true);
    makeUnit("settler", "player", ps);
    makeUnit("warrior", "player", freeNear(ps));
    makeCity("ai", as, true);
    makeUnit("settler", "ai", as);
    makeUnit("warrior", "ai", freeNear(as));
    reveal();
    g.selected = { kind: "unit", id: g.units.find((u) => u.owner === "player").id };
    note("Game", "A new continent is ready for settlement.");
    resize();
    render();
  }

  function startTile(owner) {
    return g.tiles
      .filter((t) => canStand(t) && t.terrain !== "desert" && (owner === "player" ? t.q < 5 : t.q > W - 6))
      .sort((a, b) => siteScore(b) - siteScore(a))[0] || g.tiles.find(canStand);
  }

  function siteScore(t) {
    return [t, ...neighbors(t)].reduce((s, n) => s + score(yields(n)), 0);
  }

  function canStand(t) {
    return t && TERRAIN[t.terrain].pass;
  }

  function freeNear(t) {
    return neighbors(t).find((n) => canStand(n) && !unitAt(n)) || t;
  }

  function makeUnit(type, owner, t) {
    if (!canStand(t)) return null;
    const u = { id: g.unitId++, type, owner, q: t.q, r: t.r, hp: 100, moves: UNITS[type].moves, charges: UNITS[type].charges || 0, fort: false };
    g.units.push(u);
    t.units.push(u.id);
    return u;
  }

  function makeCity(owner, t, capital) {
    const p = g.players[owner];
    const c = { id: g.cityId++, owner, name: NAMES[owner][p.nameIndex++ % NAMES[owner].length], q: t.q, r: t.r, pop: 1, hp: 100, food: 0, prod: 0, queue: owner === "player" ? "scout" : "warrior", buildings: [], capital: !!capital };
    g.cities.push(c);
    t.city = c.id;
    claim(c);
    return c;
  }

  function claim(c) {
    for (const t of g.tiles) if (dist(c, t) <= 1 && (!t.owner || t.owner === c.owner)) t.owner = c.owner;
  }

  function unitAt(t, owner) {
    return t.units.map(unit).find((u) => u && (!owner || u.owner === owner));
  }

  function enemyAt(t, owner) {
    return t.units.map(unit).find((u) => u && u.owner !== owner);
  }

  function unit(id) {
    return g.units.find((u) => u.id === id) || null;
  }

  function city(id) {
    return g.cities.find((c) => c.id === id) || null;
  }

  function cityAt(t) {
    return t.city ? city(t.city) : null;
  }

  function currentUnit() {
    return g.selected && g.selected.kind === "unit" ? unit(g.selected.id) : null;
  }

  function currentCity() {
    return g.selected && g.selected.kind === "city" ? city(g.selected.id) : null;
  }

  function reveal() {
    for (const t of g.tiles) t.visible = false;
    for (const u of g.units.filter((x) => x.owner === "player")) revealAround(u, UNITS[u.type].vision);
    for (const c of g.cities.filter((x) => x.owner === "player")) revealAround(c, 3);
  }

  function revealAround(pos, radius) {
    for (const t of g.tiles) if (dist(pos, t) <= radius) {
      t.visible = true;
      t.seen = true;
    }
  }

  function moveUnit(u, to) {
    tile(u.q, u.r).units = tile(u.q, u.r).units.filter((id) => id !== u.id);
    u.q = to.q;
    u.r = to.r;
    to.units.push(u.id);
    if (to.owner && to.owner !== u.owner && !to.city) to.owner = u.owner;
  }

  function removeUnit(u) {
    const t = tile(u.q, u.r);
    if (t) t.units = t.units.filter((id) => id !== u.id);
    g.units = g.units.filter((x) => x.id !== u.id);
    if (g.selected && g.selected.kind === "unit" && g.selected.id === u.id) g.selected = null;
  }

  function clickMap(e) {
    if (g.winner) return;
    const r = dom.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (dom.canvas.width / r.width) / devicePixelRatio;
    const y = (e.clientY - r.top) * (dom.canvas.height / r.height) / devicePixelRatio;
    const t = hit(x, y);
    if (!t) return;
    const ownUnit = unitAt(t, "player");
    const c = cityAt(t);
    if (ownUnit) g.selected = { kind: "unit", id: ownUnit.id };
    else if (c && c.owner === "player") g.selected = { kind: "city", id: c.id };
    else if (currentUnit()) order(currentUnit(), t);
    render();
  }

  function order(u, t) {
    if (u.moves <= 0) return note("Orders", UNITS[u.type].name + " has no movement left.");
    const e = enemyAt(t, u.owner);
    const c = cityAt(t);
    if (e && dist(u, e) <= 1) return attackUnit(u, e);
    if (c && c.owner !== u.owner && dist(u, c) <= 1) return attackCity(u, c);
    if (!t.visible) return note("Orders", "Scout that land before moving there.");
    if (!canStand(t) || unitAt(t) || (c && c.owner !== u.owner) || dist(u, t) > u.moves) return note("Orders", "That tile is out of reach.");
    moveUnit(u, t);
    u.moves -= TERRAIN[t.terrain].rough ? 2 : 1;
    reveal();
  }

  function attackUnit(a, d) {
    const ap = UNITS[a.type].power + (a.hp - 50) / 10;
    const dp = UNITS[d.type].power + (TERRAIN[tile(d.q, d.r).terrain].rough ? 3 : 0) + (d.fort ? 5 : 0);
    d.hp -= Math.round(Math.max(16, Math.min(58, 30 + (ap - dp) * 1.5)));
    a.hp -= Math.round(Math.max(8, Math.min(48, 22 + (dp - ap) * 1.1)));
    a.moves = 0;
    note("Combat", UNITS[a.type].name + " engaged " + UNITS[d.type].name + ".");
    if (d.hp <= 0) removeUnit(d);
    if (a.hp <= 0) removeUnit(a);
    reveal();
    victory();
  }

  function attackCity(a, c) {
    const defense = 24 + c.pop * 2 + (c.buildings.includes("walls") ? 35 : 0);
    c.hp -= Math.round(Math.max(10, Math.min(45, 24 + (UNITS[a.type].power - defense) * 1.2)));
    a.hp -= Math.round(Math.max(7, Math.min(42, 18 + (defense - UNITS[a.type].power) * 0.9)));
    a.moves = 0;
    note("Siege", c.name + " is under attack.");
    if (c.hp <= 0) {
      c.owner = a.owner;
      c.hp = 75;
      c.pop = Math.max(1, c.pop - 1);
      c.queue = a.owner === "player" ? "warrior" : "warrior";
      claim(c);
      note("Conquest", c.name + " changed hands.");
    }
    if (a.hp <= 0) removeUnit(a);
    reveal();
    victory();
  }

  function foundingIssue(t, owner) {
    if (!canStand(t)) return "A city cannot be founded here.";
    if (t.city) return "This tile already has a city.";
    if (g.cities.some((c) => dist(c, t) < 3)) return "Cities need three tiles between centers.";
    if (enemyAt(t, owner)) return "Enemy units block settlement.";
    return "";
  }

  function foundCity(u) {
    const t = tile(u.q, u.r);
    const issue = foundingIssue(t, u.owner);
    if (issue) return note("Settlers", issue);
    const c = makeCity(u.owner, t, false);
    removeUnit(u);
    note("Settlers", c.name + " was founded.");
    g.selected = c.owner === "player" ? { kind: "city", id: c.id } : g.selected;
    reveal();
  }

  function improve(u, id) {
    const t = tile(u.q, u.r);
    if (u.type !== "builder" || t.improvement || !IMP[id].terrain.includes(t.terrain)) return;
    t.improvement = id;
    t.owner = u.owner;
    u.moves = 0;
    u.charges -= 1;
    note("Builder", IMP[id].name + " completed.");
    if (u.charges <= 0) removeUnit(u);
  }

  function cityYields(c) {
    const worked = g.tiles.filter((t) => t.owner === c.owner && dist(c, t) <= 1).map((t) => ({ t, y: yields(t) })).sort((a, b) => score(b.y) - score(a.y));
    const y = [0, 0, 0, 0, 0];
    for (const w of worked.slice(0, c.pop + 1)) add(y, w.y);
    y[2] += 1 + Math.floor(c.pop / 2);
    if (c.capital) {
      y[3] += 1;
      y[4] += 1;
    }
    for (const b of c.buildings) add(y, BUILDINGS[b].y);
    if (g.players[c.owner].civics.includes("workforce")) y[1] += 1;
    if (g.players[c.owner].techs.includes("mining")) y[1] += worked.filter((w) => w.t.improvement === "mine").length;
    return y;
  }

  function processCity(c) {
    const p = g.players[c.owner];
    const y = cityYields(c);
    c.food += y[0] - c.pop * 2;
    if (c.food >= 12 + c.pop * 6) {
      c.food = 0;
      c.pop += 1;
      note("Growth", c.name + " grew to population " + c.pop + ".");
      claim(c);
    }
    c.prod += y[1];
    p.science += y[2];
    p.culture += y[3];
    p.gold += y[4];
    c.hp = Math.min(c.buildings.includes("walls") ? 135 : 100, c.hp + 5);
    finishProduction(c);
  }

  function options(owner) {
    const p = g.players[owner];
    const out = [];
    for (const [id, u] of Object.entries(UNITS)) if (!u.tech || p.techs.includes(u.tech)) {
      out.push({ id, type: "unit", name: u.name, cost: id === "settler" && p.civics.includes("empire") ? 53 : u.cost, note: u.civilian ? "Civilian unit." : "Power " + u.power + ", moves " + u.moves + "." });
    }
    for (const [id, b] of Object.entries(BUILDINGS)) if ((!b.tech || p.techs.includes(b.tech)) && (!b.civic || p.civics.includes(b.civic))) {
      out.push({ id, type: "building", name: b.name, cost: b.cost, note: b.victory ? "Science victory project." : "City upgrade." });
    }
    return out;
  }

  function finishProduction(c) {
    const opt = options(c.owner).find((o) => o.id === c.queue) || options(c.owner)[0];
    if (!opt || c.prod < opt.cost) return;
    c.prod -= opt.cost;
    if (opt.type === "unit") {
      const spawn = [tile(c.q, c.r), ...neighbors(tile(c.q, c.r))].find((t) => canStand(t) && !unitAt(t));
      if (spawn) makeUnit(opt.id, c.owner, spawn);
      note("Production", c.name + " completed " + opt.name + ".");
    } else if (!c.buildings.includes(opt.id)) {
      c.buildings.push(opt.id);
      note("Production", c.name + " completed " + opt.name + ".");
      if (opt.id === "academy" && c.owner === "player") win("player", "Science Victory", c.name + " completed the Academy.");
    }
    if (c.owner === "ai") aiQueue(c);
  }

  function research(owner) {
    advance(g.players[owner], TECHS, "tech", "techs", "science", "tp");
    advance(g.players[owner], CIVICS, "civic", "civics", "culture", "cp");
  }

  function advance(p, list, currentKey, doneKey, bankKey, progressKey) {
    let item = list.find((x) => x[0] === p[currentKey] && !p[doneKey].includes(x[0])) || list.find((x) => !p[doneKey].includes(x[0]));
    if (!item) return;
    p[currentKey] = item[0];
    p[progressKey][item[0]] = (p[progressKey][item[0]] || 0) + p[bankKey];
    p[bankKey] = 0;
    if (p[progressKey][item[0]] >= item[2]) {
      p[progressKey][item[0]] -= item[2];
      p[doneKey].push(item[0]);
      note(currentKey === "tech" ? "Research" : "Civics", p.name + " completed " + item[1] + ".");
      const next = list.find((x) => !p[doneKey].includes(x[0]));
      p[currentKey] = next ? next[0] : "";
    }
  }

  function endTurn() {
    if (g.winner) return;
    for (const c of g.cities.filter((x) => x.owner === "player")) processCity(c);
    research("player");
    for (const u of g.units.filter((x) => x.owner === "player")) u.moves = 0;
    aiTurn();
    g.turn += 1;
    for (const u of g.units.filter((x) => x.owner === "player")) {
      u.moves = UNITS[u.type].moves;
      if (u.fort) u.hp = Math.min(100, u.hp + 8);
    }
    reveal();
    selectNext();
    victory();
    save();
    render();
  }

  function aiTurn() {
    for (const c of g.cities.filter((x) => x.owner === "ai")) {
      if (!c.queue) aiQueue(c);
      processCity(c);
    }
    research("ai");
    for (const u of g.units.filter((x) => x.owner === "ai")) u.moves = UNITS[u.type].moves;
    for (const u of [...g.units.filter((x) => x.owner === "ai")]) {
      if (!unit(u.id) || u.moves <= 0) continue;
      if (u.type === "settler") {
        const t = tile(u.q, u.r);
        if (!foundingIssue(t, "ai") && g.cities.filter((c) => c.owner === "ai").length < 4) foundCity(u);
        else aiMove(u, bestSettle(u));
      } else {
        const near = neighbors(tile(u.q, u.r)).map((t) => enemyAt(t, "ai") || cityAt(t)).find((x) => x && x.owner === "player");
        if (near && near.type) attackUnit(u, near);
        else if (near) attackCity(u, near);
        else aiMove(u, nearestTarget(u));
      }
    }
  }

  function aiMove(u, target) {
    if (!target) return;
    const opts = neighbors(tile(u.q, u.r)).filter((t) => canStand(t) && !unitAt(t) && (!cityAt(t) || cityAt(t).owner === u.owner));
    opts.sort((a, b) => dist(a, target) - dist(b, target));
    if (opts[0]) {
      moveUnit(u, opts[0]);
      u.moves = 0;
    }
  }

  function nearestTarget(u) {
    return [...g.cities.filter((c) => c.owner === "player"), ...g.units.filter((x) => x.owner === "player")].sort((a, b) => dist(u, a) - dist(u, b))[0];
  }

  function bestSettle(u) {
    return g.tiles.filter((t) => !foundingIssue(t, "ai") && t.q > 4).sort((a, b) => siteScore(b) - siteScore(a) + dist(u, a) * 0.2 - dist(u, b) * 0.2)[0];
  }

  function aiQueue(c) {
    const opts = options("ai");
    const cityCount = g.cities.filter((x) => x.owner === "ai").length;
    const settlers = g.units.filter((u) => u.owner === "ai" && u.type === "settler").length;
    c.queue = cityCount < 3 && settlers < 1 && c.pop >= 2 ? "settler" : (opts.find((o) => o.id === "archer") || opts.find((o) => o.id === "spearman") || opts[0]).id;
  }

  function selectNext() {
    const u = g.units.find((x) => x.owner === "player" && x.moves > 0);
    const c = g.cities.find((x) => x.owner === "player");
    g.selected = u ? { kind: "unit", id: u.id } : c ? { kind: "city", id: c.id } : null;
  }

  function victory() {
    if (g.winner) return;
    const pc = g.cities.filter((c) => c.owner === "player");
    const ac = g.cities.filter((c) => c.owner === "ai");
    if (!ac.length) return win("player", "Domination Victory", "The rival civilization has no cities left.");
    if (!pc.length) return win("ai", "Defeat", "Your last city has fallen.");
    if (pc.some((c) => c.buildings.includes("academy"))) return win("player", "Science Victory", "Your Academy led the world into a new era.");
    if (g.players.player.civics.length >= CIVICS.length && pc.reduce((s, c) => s + c.pop, 0) >= 10) return win("player", "Culture Victory", "Your cities shaped the continent's culture.");
    if (g.turn > MAX_TURN) return win(scoreEmpire("player") >= scoreEmpire("ai") ? "player" : "ai", "Score Victory", "The age ends " + scoreEmpire("player") + " to " + scoreEmpire("ai") + ".");
  }

  function scoreEmpire(owner) {
    const p = g.players[owner];
    return g.cities.filter((c) => c.owner === owner).reduce((s, c) => s + c.pop * 8 + c.buildings.length * 6, 0) +
      g.units.filter((u) => u.owner === owner).length * 3 + p.techs.length * 7 + p.civics.length * 6 + Math.floor(p.gold / 10);
  }

  function win(owner, title, body) {
    g.winner = owner;
    note("Victory", title + ": " + body);
    dom.modalEyebrow.textContent = owner === "player" ? "Victory" : "Defeat";
    dom.modalTitle.textContent = title;
    dom.modalBody.textContent = body;
    dom.modal.classList.remove("hidden");
  }

  function note(title, message) {
    if (g.log[0] && g.log[0].title === title && g.log[0].message === message && g.log[0].turn === g.turn) return;
    g.log.unshift({ title, message, turn: g.turn });
    g.log = g.log.slice(0, 40);
  }

  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(g));
  }

  function load() {
    try {
      g = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!g || !g.tiles) return false;
      g.map = {};
      for (const t of g.tiles) {
        t.c = {};
        t.poly = [];
        g.map[key(t.q, t.r)] = t;
      }
      reveal();
      resize();
      render();
      return true;
    } catch (error) {
      return false;
    }
  }

  function render() {
    draw();
    panels();
  }

  function panels() {
    const total = empireYields("player");
    dom.yieldBar.innerHTML = chip("food", "Food", total[0]) + chip("prod", "Prod", total[1]) + chip("science", "Science", total[2]) + chip("culture", "Culture", total[3]) + chip("gold", "Gold", g.players.player.gold + " +" + total[4]);
    dom.turn.textContent = "Turn " + g.turn + " / " + MAX_TURN + " - " + g.players.player.name;
    renderSelection();
    renderResearch();
    renderEmpire();
    renderProduction();
    renderActions();
    dom.log.innerHTML = g.log.slice(0, 20).map((l) => "<li><b>Turn " + l.turn + " / " + l.title + "</b><br>" + l.message + "</li>").join("");
    dom.hint.textContent = hover ? line(hover) : currentUnit() ? UNITS[currentUnit().type].name + " selected. Moves left: " + currentUnit().moves + "." : "Explore, settle, research, and outscore the rival civilization.";
  }

  function chip(cls, label, val) {
    return "<div class=\"yield-chip " + cls + "\"><i class=\"yield-dot\"></i><b>" + val + "</b><span>" + label + "</span></div>";
  }

  function empireYields(owner) {
    return g.cities.filter((c) => c.owner === owner).reduce((sum, c) => add(sum, cityYields(c)), [0, 0, 0, 0, 0]);
  }

  function renderSelection() {
    const u = currentUnit();
    const c = currentCity();
    if (u) {
      dom.selection.innerHTML = "<div class=\"section-title\"><h2>" + UNITS[u.type].name + "</h2><span class=\"badge good\">Moves " + u.moves + "</span></div><p class=\"tile-note\">" + line(tile(u.q, u.r)) + "</p><div class=\"stat-grid\">" + stat(u.hp, "Health") + stat(UNITS[u.type].power, "Strength") + stat(UNITS[u.type].vision, "Vision") + stat(u.charges || "-", "Charges") + "</div>";
    } else if (c) {
      const y = cityYields(c);
      dom.selection.innerHTML = "<div class=\"section-title\"><h2>" + c.name + "</h2><span class=\"badge good\">Pop " + c.pop + "</span></div><p class=\"tile-note\">" + (c.capital ? "Capital" : "City") + " at " + c.q + ", " + c.r + ".</p><div class=\"stat-grid\">" + stat(c.hp, "Defense") + stat(Math.floor(c.food) + "/" + (12 + c.pop * 6), "Growth") + stat(y[0], "Food") + stat(y[1], "Production") + stat(y[2], "Science") + stat(y[3], "Culture") + "</div>";
    } else if (hover) {
      const y = yields(hover);
      dom.selection.innerHTML = "<div class=\"section-title\"><h2>" + TERRAIN[hover.terrain].name + "</h2><span class=\"badge\">" + hover.q + ", " + hover.r + "</span></div><p class=\"tile-note\">" + line(hover) + "</p><div class=\"stat-grid\">" + stat(y[0], "Food") + stat(y[1], "Production") + stat(y[2], "Science") + stat(y[3], "Culture") + stat(y[4], "Gold") + stat(hover.owner ? g.players[hover.owner].name : "-", "Owner") + "</div>";
    } else dom.selection.innerHTML = "<h2>Selection</h2><p class=\"empty-state\">Select a unit, city, or visible tile.</p>";
  }

  function renderResearch() {
    const p = g.players.player;
    dom.research.innerHTML = "<div class=\"section-title\"><h2>Research</h2><span class=\"badge\">Stored " + p.science + "</span></div>" + track("tech", TECHS, p.techs, p.tech, p.tp, "science") + "<h3>Civics</h3>" + track("civic", CIVICS, p.civics, p.civic, p.cp, "culture");
  }

  function track(kind, list, done, active, progress, cls) {
    return "<div class=\"research-list\">" + list.map((x) => {
      const complete = done.includes(x[0]);
      return "<button class=\"choice-button " + (active === x[0] ? "active" : "") + "\" data-research-kind=\"" + kind + "\" data-research-id=\"" + x[0] + "\" " + (complete ? "disabled" : "") + "><strong>" + x[1] + (complete ? " complete" : "") + "</strong><small>" + x[3] + "</small><div class=\"progress " + cls + "\"><span style=\"width:" + Math.min(100, ((complete ? x[2] : progress[x[0]] || 0) / x[2]) * 100) + "%\"></span></div></button>";
    }).join("") + "</div>";
  }

  function renderEmpire() {
    const p = g.players.player;
    dom.empire.innerHTML = "<div class=\"section-title\"><h2>Empire</h2><span class=\"badge good\">Score " + scoreEmpire("player") + "</span></div><div class=\"stat-grid\">" +
      stat(g.cities.filter((c) => c.owner === "player").length, "Cities") + stat(g.units.filter((u) => u.owner === "player").length, "Units") +
      stat(p.techs.length + "/" + TECHS.length, "Techs") + stat(p.civics.length + "/" + CIVICS.length, "Civics") + stat(g.players.player.gold, "Gold") + stat(scoreEmpire("ai"), "Rival score") +
      "</div><h3>Cities</h3><div class=\"unit-list\">" + g.cities.filter((c) => c.owner === "player").map((c) => {
        const o = options("player").find((x) => x.id === c.queue) || { cost: 1 };
        return "<button class=\"unit-row\" data-select-city=\"" + c.id + "\"><strong>" + c.name + "</strong><small>Pop " + c.pop + " / " + prodName(c.queue) + " " + Math.floor(c.prod) + "/" + o.cost + "</small><div class=\"progress prod\"><span style=\"width:" + Math.min(100, c.prod / o.cost * 100) + "%\"></span></div></button>";
      }).join("") + "</div>";
  }

  function renderProduction() {
    const c = currentCity();
    if (!c || c.owner !== "player") {
      dom.production.innerHTML = "<h2>Production</h2><p class=\"empty-state\">Select one of your cities to set production.</p>";
      return;
    }
    dom.production.innerHTML = "<div class=\"section-title\"><h2>" + c.name + " Queue</h2><span class=\"badge\">" + Math.floor(c.prod) + " stored</span></div><div class=\"production-list\">" +
      options("player").filter((o) => o.type !== "building" || !c.buildings.includes(o.id)).map((o) => "<button class=\"production-button " + (c.queue === o.id ? "active" : "") + "\" data-city-id=\"" + c.id + "\" data-production-id=\"" + o.id + "\"><strong>" + o.name + " / " + o.cost + "</strong><small>" + o.note + "</small></button>").join("") +
      "</div>" + (c.buildings.length ? "<h3>Buildings</h3><div class=\"building-list\">" + c.buildings.map((id) => "<div class=\"building-row\"><strong>" + BUILDINGS[id].name + "</strong><small>City upgrade.</small></div>").join("") + "</div>" : "");
  }

  function renderActions() {
    const u = currentUnit();
    if (!u || u.owner !== "player") {
      dom.actions.innerHTML = currentCity() ? "<span class=\"badge\">Choose production from the city panel.</span>" : "<span class=\"badge\">Select a unit or city.</span>";
      return;
    }
    const t = tile(u.q, u.r);
    const buttons = [];
    if (u.type === "settler") buttons.push(button("found", "Found City", "gold", foundingIssue(t, "player")));
    if (u.type === "builder") for (const [id, imp] of Object.entries(IMP)) buttons.push(button("improve:" + id, imp.name, "", t.improvement || !imp.terrain.includes(t.terrain) ? "Invalid terrain" : ""));
    buttons.push(button("heal", "Heal", "", u.hp >= 100 ? "Full health" : ""));
    buttons.push(button("skip", "Fortify", "", ""));
    buttons.push("<span class=\"badge\">Click adjacent highlighted tiles to move or attack.</span>");
    dom.actions.innerHTML = buttons.join("");
  }

  function button(action, label, cls, disabled) {
    return "<button class=\"tool-button " + cls + "\" data-action=\"" + action + "\" " + (disabled ? "disabled title=\"" + disabled + "\"" : "") + ">" + label + "</button>";
  }

  function stat(v, label) {
    return "<div class=\"stat\"><b>" + v + "</b><span>" + label + "</span></div>";
  }

  function prodName(id) {
    return (UNITS[id] && UNITS[id].name) || (BUILDINGS[id] && BUILDINGS[id].name) || id;
  }

  function line(t) {
    if (!t.seen) return "Unexplored territory.";
    return [TERRAIN[t.terrain].name, t.resource && RES[t.resource].name, t.improvement && IMP[t.improvement].name, t.owner && g.players[t.owner].name].filter(Boolean).join(" / ");
  }

  function draw() {
    if (!g || !layout) return;
    tick += 1;
    ctx.save();
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, layout.w, layout.h);
    ctx.fillStyle = "#101318";
    ctx.fillRect(0, 0, layout.w, layout.h);
    for (const t of g.tiles) drawTile(t);
    drawReach();
    for (const c of g.cities) drawCity(c);
    for (const u of g.units) drawUnit(u);
    drawSelect();
    ctx.restore();
  }

  function drawTile(t) {
    const terr = TERRAIN[t.terrain];
    ctx.globalAlpha = t.visible ? 1 : t.seen ? 0.5 : 0.18;
    hex(t.poly);
    ctx.fillStyle = t.seen ? terr.color : "#222831";
    ctx.fill();
    ctx.strokeStyle = terr.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (t.owner && t.seen) {
      hex(scalePoly(t, 0.88));
      ctx.strokeStyle = g.players[t.owner].color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (t.resource && t.seen) drawResource(t);
    if (t.improvement && t.seen) drawImprovement(t);
    ctx.globalAlpha = 1;
    if (!t.visible) {
      hex(t.poly);
      ctx.fillStyle = t.seen ? "rgba(8,9,12,.35)" : "rgba(5,6,8,.72)";
      ctx.fill();
    }
  }

  function drawResource(t) {
    const r = RES[t.resource];
    ctx.beginPath();
    ctx.arc(t.c.x + layout.s * 0.3, t.c.y + layout.s * 0.34, Math.max(7, layout.s * 0.2), 0, Math.PI * 2);
    ctx.fillStyle = t.resource === "gold" ? "#efc067" : t.resource === "iron" ? "#bcc2c7" : "#f4efe5";
    ctx.fill();
    ctx.fillStyle = "#15171b";
    ctx.font = "700 " + Math.max(8, layout.s * 0.22) + "px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(r.short, t.c.x + layout.s * 0.3, t.c.y + layout.s * 0.34);
  }

  function drawImprovement(t) {
    const x = t.c.x - layout.s * 0.35;
    const y = t.c.y + layout.s * 0.28;
    ctx.strokeStyle = "#f4efe5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (t.improvement === "farm") {
      ctx.moveTo(x - 7, y + 5);
      ctx.lineTo(x + 7, y - 5);
      ctx.moveTo(x - 6, y - 4);
      ctx.lineTo(x + 6, y + 4);
    } else if (t.improvement === "mine") {
      ctx.moveTo(x - 8, y + 6);
      ctx.lineTo(x, y - 7);
      ctx.lineTo(x + 8, y + 6);
    } else ctx.rect(x - 7, y - 5, 14, 10);
    ctx.stroke();
  }

  function drawReach() {
    const u = currentUnit();
    if (!u || u.moves <= 0) return;
    for (const t of neighbors(tile(u.q, u.r))) if (t.visible && (canStand(t) || enemyAt(t, u.owner) || (cityAt(t) && cityAt(t).owner !== u.owner))) {
      hex(scalePoly(t, 0.76));
      ctx.fillStyle = enemyAt(t, u.owner) || (cityAt(t) && cityAt(t).owner !== u.owner) ? "rgba(222,111,104,.22)" : "rgba(79,143,255,.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(166,200,255,.55)";
      ctx.stroke();
    }
  }

  function drawCity(c) {
    const t = tile(c.q, c.r);
    if (!t.seen) return;
    const x = t.c.x;
    const y = t.c.y - layout.s * 0.08;
    ctx.globalAlpha = t.visible || c.owner === "player" ? 1 : 0.48;
    ctx.fillStyle = "rgba(17,19,23,.85)";
    ctx.strokeStyle = g.players[c.owner].color;
    ctx.lineWidth = 2;
    round(x - layout.s * 0.62, y - layout.s * 0.28, layout.s * 1.24, layout.s * 0.56, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = g.players[c.owner].color;
    ctx.fillRect(x - layout.s * 0.48, y - layout.s * 0.48, layout.s * 0.26, layout.s * 0.22);
    ctx.fillRect(x + layout.s * 0.2, y - layout.s * 0.45, layout.s * 0.24, layout.s * 0.19);
    ctx.fillStyle = "#f4efe5";
    ctx.font = "700 " + Math.max(10, layout.s * 0.24) + "px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(c.pop), x, y);
    ctx.font = "700 " + Math.max(8, layout.s * 0.18) + "px system-ui";
    ctx.fillText(c.name.slice(0, 10), x, y + layout.s * 0.45);
    bar(x, y + layout.s * 0.66, layout.s, 5, c.hp, c.buildings.includes("walls") ? 135 : 100);
    ctx.globalAlpha = 1;
  }

  function drawUnit(u) {
    const t = tile(u.q, u.r);
    if (!t.seen || (u.owner !== "player" && !t.visible)) return;
    const def = UNITS[u.type];
    const x = t.c.x;
    const y = t.c.y + layout.s * 0.36 - t.units.indexOf(u.id) * layout.s * 0.2;
    ctx.beginPath();
    ctx.arc(x, y, layout.s * 0.31, 0, Math.PI * 2);
    ctx.fillStyle = g.players[u.owner].color;
    ctx.fill();
    ctx.strokeStyle = "rgba(244,239,229,.88)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#111317";
    ctx.font = "800 " + Math.max(10, layout.s * 0.25) + "px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.short, x, y);
    bar(x, y + layout.s * 0.38, layout.s * 0.72, 4, u.hp, 100);
  }

  function drawSelect() {
    const s = currentUnit() || currentCity();
    const t = s ? tile(s.q, s.r) : hover;
    if (!t) return;
    hex(scalePoly(t, 0.82 + Math.sin(tick / 14) * 0.08));
    ctx.strokeStyle = "#ffe1a0";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function hex(poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }

  function scalePoly(t, f) {
    return t.poly.map((p) => ({ x: t.c.x + (p.x - t.c.x) * f, y: t.c.y + (p.y - t.c.y) * f }));
  }

  function bar(x, y, w, h, v, m) {
    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = v / m > 0.45 ? "#9fe3a2" : "#f28d86";
    ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, v / m)), h);
  }

  function round(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function resize() {
    if (!g) return;
    const rect = dom.canvas.getBoundingClientRect();
    const w = Math.max(420, rect.width || 900);
    const h = Math.max(420, rect.height || 620);
    dom.canvas.width = Math.floor(w * devicePixelRatio);
    dom.canvas.height = Math.floor(h * devicePixelRatio);
    dom.canvas.style.width = w + "px";
    dom.canvas.style.height = h + "px";
    const s = Math.max(21, Math.min((w - 48) / (1.5 * (W - 1) + 2), (h - 58) / (SQRT3 * (H + 0.5))));
    const mapW = s * (1.5 * (W - 1) + 2);
    const mapH = SQRT3 * s * (H + 0.5);
    layout = { w, h, s, hexH: SQRT3 * s, ox: (w - mapW) / 2, oy: (h - mapH) / 2 + 14 };
    for (const t of g.tiles) {
      t.c = { x: layout.ox + s + t.q * s * 1.5, y: layout.oy + layout.hexH / 2 + t.r * layout.hexH + (t.q % 2 ? layout.hexH / 2 : 0) };
      t.poly = Array.from({ length: 6 }, (_, i) => ({ x: t.c.x + s * 0.96 * Math.cos(Math.PI / 180 * 60 * i), y: t.c.y + s * 0.96 * Math.sin(Math.PI / 180 * 60 * i) }));
    }
    draw();
  }

  function hit(x, y) {
    return g.tiles.find((t) => inside({ x, y }, t.poly));
  }

  function inside(p, poly) {
    let ok = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1) + a.x) ok = !ok;
    }
    return ok;
  }

  function bind() {
    dom.canvas.addEventListener("click", clickMap);
    dom.canvas.addEventListener("mousemove", (e) => {
      const r = dom.canvas.getBoundingClientRect();
      hover = hit((e.clientX - r.left) * (dom.canvas.width / r.width) / devicePixelRatio, (e.clientY - r.top) * (dom.canvas.height / r.height) / devicePixelRatio);
      draw();
      panels();
    });
    dom.canvas.addEventListener("mouseleave", () => {
      hover = null;
      render();
    });
    dom.endTurn.addEventListener("click", endTurn);
    dom.newGame.addEventListener("click", () => {
      localStorage.removeItem(SAVE_KEY);
      dom.modal.classList.add("hidden");
      newGame();
      save();
    });
    dom.save.addEventListener("click", () => {
      save();
      note("Save", "Game saved in this browser.");
      render();
    });
    dom.clear.addEventListener("click", () => {
      g.log = [];
      render();
    });
    dom.modalClose.addEventListener("click", () => dom.modal.classList.add("hidden"));
    dom.modalRestart.addEventListener("click", () => {
      localStorage.removeItem(SAVE_KEY);
      dom.modal.classList.add("hidden");
      newGame();
      save();
    });
    window.addEventListener("resize", () => {
      resize();
      render();
    });
    document.addEventListener("click", (e) => {
      const rb = e.target.closest("[data-research-id]");
      const pb = e.target.closest("[data-production-id]");
      const cb = e.target.closest("[data-select-city]");
      const ab = e.target.closest("[data-action]");
      if (rb) {
        const p = g.players.player;
        if (rb.dataset.researchKind === "tech") p.tech = rb.dataset.researchId;
        else p.civic = rb.dataset.researchId;
      } else if (pb) {
        city(Number(pb.dataset.cityId)).queue = pb.dataset.productionId;
        note("Production", city(Number(pb.dataset.cityId)).name + " is now producing " + prodName(pb.dataset.productionId) + ".");
      } else if (cb) g.selected = { kind: "city", id: Number(cb.dataset.selectCity) };
      else if (ab) action(ab.dataset.action);
      if (rb || pb || cb || ab) render();
    });
  }

  function action(a) {
    const u = currentUnit();
    if (!u) return;
    if (a === "found") foundCity(u);
    else if (a === "heal" && u.hp < 100) {
      u.hp = Math.min(100, u.hp + 20);
      u.moves = 0;
      u.fort = true;
    } else if (a === "skip") {
      u.moves = 0;
      u.fort = true;
      selectNext();
    } else if (a.startsWith("improve:")) improve(u, a.split(":")[1]);
  }

  function boot() {
    bind();
    if (!load()) {
      newGame();
      save();
    }
    setInterval(draw, 120);
  }

  boot();
})();
