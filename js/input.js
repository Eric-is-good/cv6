// ===== 输入：鼠标点击/拖拽/缩放、键盘 =====
var Input = (function () {
  'use strict';

  var down = false, dragging = false;
  var lastX = 0, lastY = 0, downX = 0, downY = 0, downT = 0;
  var DRAG_THRESHOLD = 5;

  function init() {
    var canvas = G.canvas;
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    if (UI.isModalOpen()) return;
    down = true; dragging = false;
    lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY; downT = Date.now();
  }

  function onMouseMove(e) {
    if (down) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(e.clientX - downX) > DRAG_THRESHOLD || Math.abs(e.clientY - downY) > DRAG_THRESHOLD) dragging = true;
      if (dragging) {
        G.cam.x += dx; G.cam.y += dy;
        Render.markDirty();
      }
      lastX = e.clientX; lastY = e.clientY;
    }
    // 悬停
    var rect = G.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var h = Render.screenToHex(mx, my);
    Render.setHover(Util.axialKey(h.q, h.r));
  }

  function onMouseUp(e) {
    if (!down) return;
    down = false;
    if (!dragging && Date.now() - downT < 400) {
      var rect = G.canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var h = Render.screenToHex(mx, my);
      Game.onTileClick(h.q, h.r);
    }
    dragging = false;
  }

  function onWheel(e) {
    e.preventDefault();
    var rect = G.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var before = Render.screenToHex(mx, my);
    var factor = e.deltaY < 0 ? 1.12 : 0.89;
    G.cam.zoom = Util.clamp(G.cam.zoom * factor, 0.35, 2.2);
    // 保持鼠标处格子不动
    var p = Util.axialToPixel(before.q, before.r, 46);
    G.cam.x = mx - p.x * G.cam.zoom;
    G.cam.y = my - p.y * G.cam.zoom;
    Render.markDirty();
  }

  function onContext(e) { e.preventDefault(); }

  function onKeyDown(e) {
    if (UI.isModalOpen()) {
      if (e.key === 'Escape') document.querySelector('.modal:not(.hidden) input') ? null : null;
      return;
    }
    var step = 60;
    if (e.key === 'ArrowUp' || e.key === 'w') G.cam.y += step;
    else if (e.key === 'ArrowDown' || e.key === 's') G.cam.y -= step;
    else if (e.key === 'ArrowLeft' || e.key === 'a') G.cam.x += step;
    else if (e.key === 'ArrowRight' || e.key === 'd') G.cam.x -= step;
    else if (e.key === 'y' || e.key === 'Y') { G.showYields = !G.showYields; }
    else if (e.key === ' ') { e.preventDefault(); Game.endTurn(); return; }
    else if (e.key === 'Escape') { Game.clearSelection(); }
    else if (e.key === 'c' || e.key === 'C') {
      if (G.sel && G.sel.unit) { var c = Game.centerOfUnit(); }
    } else return;
    Render.markDirty();
  }

  return { init: init };
})();
