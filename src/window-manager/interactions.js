/**
 * mathicx-file · window-manager/interactions.js
 * Lógica de drag (titlebar) e resize (8 alças) via Pointer Events.
 *
 * - Usa setPointerCapture para captura robusta (mouse + touch + pen).
 * - Movimentação throttled por rAF (evita layout thrash).
 * - Detecta snap por drag e mostra preview em tempo real.
 *
 * É puro comportamento: recebe um AppWindow e o SnapManager.
 */

import { clamp, rafThrottle } from '../core/utils.js';

const MIN_W = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--window-min-w')) || 320;
const MIN_H = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--window-min-h')) || 240;
const TASKBAR = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-h')) || 56;

/** Anexa drag + resize + controles a uma janela. Retorna cleanup. */
export function attachInteractions(win, wm, snap) {
  const el = win.el;
  const titlebar = win.titlebarEl;

  // --- Controles de janela (delegation local ao titlebar) ---
  titlebar.addEventListener('click', (e) => {
    const min = e.target.closest('.os-min');
    const max = e.target.closest('.os-max');
    const close = e.target.closest('.os-close');
    if (close) { e.stopPropagation(); wm.close(win.id); return; }
    if (min) { e.stopPropagation(); wm.minimize(win.id); return; }
    if (max) { e.stopPropagation(); wm.toggleMaximize(win.id); return; }
  });

  // Duplo clique no titlebar = maximiza/restaura
  titlebar.addEventListener('dblclick', (e) => {
    if (e.target.closest('.os-btn')) return;
    wm.toggleMaximize(win.id);
  });

  // --- Drag via titlebar ---
  let dragState = null;

  const onTitlebarDown = (e) => {
    if (e.target.closest('.os-btn')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Se estava maximizada/snapped, "desgruda" a janela do snap ao arrastar
    if (win.maximized) {
      // restaura mas mantém sob o cursor proporcionalmente
      const ratio = (e.clientX - el.getBoundingClientRect().left) / el.offsetWidth;
      wm.toggleMaximize(win.id, { restoreOnly: true });
      const newW = win.getRect().width;
      win.setRect({ left: e.clientX - newW * ratio, top: 0 });
    } else if (win.snapped) {
      // desfaz snap mantendo largura
      const r = win.getRect();
      win.snapped = null;
      el.classList.remove('snapped');
      const ratio = (e.clientX - r.left) / r.width;
      win.setRect({ left: e.clientX - 400 * ratio, top: r.top, width: Math.min(800, r.width), height: r.height });
    }

    const r = win.getRect();
    dragState = {
      id: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      origLeft: r.left, origTop: r.top,
    };
    titlebar.setPointerCapture(e.pointerId);
    wm.focus(win.id);
    e.preventDefault();
  };

  const onTitlebarMove = rafThrottle((e) => {
    if (!dragState || e.pointerId !== dragState.id) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const left = dragState.origLeft + dx;
    const top = clamp(dragState.origTop + dy, 0, window.innerHeight - TASKBAR() - 10);
    el.style.left = left + 'px';
    el.style.top = top + 'px';

    // Detecção de snap por drag
    const zone = snap.detectDragSnap(e.clientX, e.clientY);
    snap.showPreview(zone);
    dragState._zone = zone;
  });

  const endDrag = (e) => {
    if (!dragState) return;
    snap.hidePreview();
    if (dragState._zone && dragState._zone.k === 'max') {
      wm.toggleMaximize(win.id);
    } else if (dragState._zone) {
      snap.applyZone(win, dragState._zone);
    }
    dragState = null;
  };

  titlebar.addEventListener('pointerdown', onTitlebarDown);
  titlebar.addEventListener('pointermove', onTitlebarMove);
  titlebar.addEventListener('pointerup', endDrag);
  titlebar.addEventListener('pointercancel', endDrag);

  // --- Resize (8 alças) ---
  const onResizeDown = (e) => {
    const handle = e.target.closest('.os-resize');
    if (!handle) return;
    if (win.maximized) return;
    e.stopPropagation();
    e.preventDefault();

    const dir = [...handle.classList].find((c) => ['n','s','e','w','ne','nw','se','sw'].includes(c));
    const r = win.getRect();
    const state = {
      id: e.pointerId, dir,
      startX: e.clientX, startY: e.clientY,
      origLeft: r.left, origTop: r.top, origW: r.width, origH: r.height,
    };
    handle.setPointerCapture(e.pointerId);

    const onMove = rafThrottle((ev) => {
      if (ev.pointerId !== state.id) return;
      const dx = ev.clientX - state.startX;
      const dy = ev.clientY - state.startY;
      let { origLeft: L, origTop: T, origW: W, origH: H } = state;
      const d = state.dir;

      if (d.includes('e')) W = Math.max(MIN_W(), state.origW + dx);
      if (d.includes('s')) H = Math.max(MIN_H(), state.origH + dy);
      if (d.includes('w')) { const nw = Math.max(MIN_W(), state.origW - dx); L = state.origLeft + (state.origW - nw); W = nw; }
      if (d.includes('n')) { const nh = Math.max(MIN_H(), state.origH - dy); T = Math.max(0, state.origTop + (state.origH - nh)); H = nh; }

      el.style.width = W + 'px';
      el.style.height = H + 'px';
      el.style.left = L + 'px';
      el.style.top = T + 'px';
    });
    const onUp = (ev) => {
      if (ev.pointerId !== state.id) return;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      handle.releasePointerCapture?.(state.id);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };
  el.addEventListener('pointerdown', onResizeDown);

  // Foco ao interagir
  el.addEventListener('pointerdown', () => wm.focus(win.id), true);

  return () => {
    titlebar.removeEventListener('pointerdown', onTitlebarDown);
    titlebar.removeEventListener('pointermove', onTitlebarMove);
    titlebar.removeEventListener('pointerup', endDrag);
    titlebar.removeEventListener('pointercancel', endDrag);
    el.removeEventListener('pointerdown', onResizeDown);
  };
}
