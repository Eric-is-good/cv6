// ===== 科技树：研究、解锁、胜利判定 =====
var Tech = (function () {
  'use strict';

  function researched(civ, id) { return !!civ.techs[id]; }

  function reqsMet(civ, id) {
    var tech = Data.TECH[id];
    for (var i = 0; i < tech.req.length; i++) {
      if (!civ.techs[tech.req[i]]) return false;
    }
    return true;
  }

  function availableTechs(civ) {
    var out = [];
    for (var id in Data.TECH) {
      if (civ.techs[id]) continue;
      if (reqsMet(civ, id)) out.push(id);
    }
    return out;
  }

  function setResearch(civ, id) {
    if (id && (!Data.TECH[id] || !reqsMet(civ, id) || civ.techs[id])) return;
    civ.research = { id: id, progress: 0 };
  }

  function researchTick(civ) {
    var sci = civ.sciencePool;
    civ.sciencePool = 0;
    if (!sci) sci = 0;
    if (!civ.research || !civ.research.id) {
      // 自动选最便宜可用科技
      var avail = availableTechs(civ);
      if (avail.length && civ.isPlayer) {
        // 不自动替玩家选；保留待玩家选
      } else if (avail.length) {
        setResearch(civ, cheapest(avail));
      }
    }
    if (civ.research && civ.research.id) {
      civ.research.progress += sci;
      var tech = Data.TECH[civ.research.id];
      if (civ.research.progress >= tech.cost) {
        completeTech(civ, civ.research.id);
        civ.research = { id: null, progress: 0 };
        // AI 自动续研
        if (!civ.isPlayer) {
          var a2 = availableTechs(civ);
          if (a2.length) setResearch(civ, cheapest(a2));
        }
      }
    }
  }

  function cheapest(list) {
    var best = list[0], bc = Data.TECH[best].cost;
    for (var i = 1; i < list.length; i++) {
      if (Data.TECH[list[i]].cost < bc) { best = list[i]; bc = Data.TECH[list[i]].cost; }
    }
    return best;
  }

  function completeTech(civ, id) {
    civ.techs[id] = true;
    civ.researchedCount = (civ.researchedCount || 0) + 1;
    var tech = Data.TECH[id];
    var parts = ['🔬 ' + G.civs[civ.id].name + ' 研发了 ' + tech.name];
    if (tech.reveal) {
      // 揭示战略资源
      parts.push('（发现 ' + (Data.RESOURCE[tech.reveal] ? Data.RESOURCE[tech.reveal].name : tech.reveal) + '）');
    }
    var msg = parts.join('');
    G.log.push({ t: G.turn, msg: msg });
    if (civ.isPlayer) UI.notify(msg, 'good');
    // 重新统计资源
    Cities.recountResources(civ);
  }

  function researchInfo(civ) {
    if (!civ.research || !civ.research.id) return null;
    var tech = Data.TECH[civ.research.id];
    return {
      id: civ.research.id, name: tech.name, cost: tech.cost,
      progress: civ.research.progress, era: tech.era
    };
  }

  // 科技胜利：研发所有科技
  function scienceVictory(civ) {
    var total = 0, done = 0;
    for (var id in Data.TECH) {
      total++;
      if (civ.techs[id]) done++;
    }
    return total > 0 && done >= total;
  }

  // 建议下一步研究（玩家无当前研究时给提示）
  function suggestNext(civ) {
    return cheapest(availableTechs(civ));
  }

  return {
    researched: researched, reqsMet: reqsMet, availableTechs: availableTechs,
    setResearch: setResearch, researchTick: researchTick, completeTech: completeTech,
    researchInfo: researchInfo, scienceVictory: scienceVictory, suggestNext: suggestNext
  };
})();
