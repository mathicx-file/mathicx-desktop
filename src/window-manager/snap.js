/**
 * mathicx-file · window-manager/snap.js
 * Snap Layouts (inspirado no Windows 11).
 *
 * - Flyout no hover do botão maximizar com 6 layouts em grade.
 * - Snap lateral (drag para a borda) → meia-tela.
 * - Snap em quadrantes (drag para os cantos) → 1/4 de tela.
 * - Win+Z abre o flyout para a janela focada.
 *
 * Cada layout é uma matriz de zonas; ao escolher, a janela ocupa a zona.
 */

const TASKBAR = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-h')) || 56;

/** Viewport útil (acima da taskbar). */
const workArea = () => ({
  left: 0, top: 0,
  width: window.innerWidth,
  height: window.innerHeight - TASKBAR(),
});

/** 6 layouts do Windows 11 (cada um: array de zonas com nome). */
export const SNAP_LAYOUTS = [
  // 1: 50 | 50
  [{ k: 'left',  x: 0,    y: 0, w: .5, h: 1 }, { k: 'right', x: .5, y: 0, w: .5, h: 1 }],
  // 2: 33 | 33 | 33
  [{ k: 'l', x: 0,    y: 0, w: .34, h: 1 }, { k: 'c', x: .34, y: 0, w: .33, h: 1 }, { k: 'r', x: .67, y: 0, w: .33, h: 1 }],
  // 3: 66 | 34
  [{ k: 'big',   x: 0,    y: 0, w: .66, h: 1 }, { k: 'side', x: .66, y: 0, w: .34, h: 1 }],
  // 4: 4 quadrantes
  [
    { k: 'tl', x: 0,    y: 0,   w: .5, h: .5 }, { k: 'tr', x: .5, y: 0,   w: .5, h: .5 },
    { k: 'bl', x: 0,    y: .5,  w: .5, h: .5 }, { k: 'br', x: .5, y: .5,  w: .5, h: .5 },
  ],
  // 5: coluna esquerda grande + 2 à direita
  [
    { k: 'big',  x: 0,    y: 0,  w: .66, h: 1 },
    { k: 'tr',   x: .66,  y: 0,  w: .34, h: .5 }, { k: 'br', x: .66, y: .5, w: .34, h: .5 },
  ],
  // 6: 3 linhas horizontais (topo cheio + 2 embaixo)
  [
    { k: 'top', x: 0, y: 0,   w: 1, h: .5 },
    { k: 'bl',  x: 0, y: .5,  w: .5, h: .5 }, { k: 'br', x: .5, y: .5, w: .5, h: .5 },
  ],
];

class SnapManager {
  constructor(wm) {
    this.wm = wm;
    this._activeFlyout = null;
    this._hoverTimer = null;
    this._previewEl = null;
  }

  /** Registra hover no botão maximizar para abrir o flyout. */
  attachTo(win) {
    const maxBtn = win.el.querySelector('.os-max');
    if (!maxBtn) return;

    const open = () => {
      clearTimeout(this._hoverTimer);
      this._hoverTimer = setTimeout(() => this.showLayoutsFor(win.id), 350);
    };
    const close = () => {
      clearTimeout(this._hoverTimer);
    };
    maxBtn.addEventListener('mouseenter', open);
    maxBtn.addEventListener('mouseleave', close);
  }

  /** Mostra o flyout de layouts para a janela informada. */
  showLayoutsFor(winId) {
    const win = this.wm.getById(winId);
    if (!win) return;
    this._dismissFlyout();

    const flyout = document.createElement('div');
    flyout.className = 'snap-flyout';
    flyout.innerHTML = `<div class="snap-title">Escolha um layout</div>`;

    SNAP_LAYOUTS.forEach((layout, idx) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'snap-layout';
      item.style.gridTemplateColumns = `repeat(${layout.reduce((m, z) => Math.max(m, Math.ceil(1 / z.w)), 1)}, 1fr)`;
      item.style.gridTemplateRows = `repeat(${layout.reduce((m, z) => Math.max(m, Math.ceil(1 / z.h)), 1)}, 1fr)`;

      layout.forEach((zone) => {
        const sz = document.createElement('span');
        sz.className = 'sz';
        item.appendChild(sz);
      });

      // Click no layout -> abre seleção de zona
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showZones(win, layout);
      });
      flyout.appendChild(item);
    });

    win.el.appendChild(flyout);
    this._activeFlyout = { el: flyout, win };

    // Fecha ao sair ou clicar fora
    const dismiss = () => this._dismissFlyout();
    flyout.addEventListener('mouseleave', dismiss);
    setTimeout(() => {
      document.addEventListener('click', dismiss, { once: true });
    }, 0);
  }

  /** Após escolher um layout, mostra zonas clicáveis para posicionar. */
  _showZones(win, layout) {
    this._dismissFlyout();
    const overlay = document.createElement('div');
    overlay.className = 'snap-preview';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(5,8,16,.45);z-index:60;display:block;border:none;border-radius:0;box-shadow:none;';
    const wa = workArea();

    layout.forEach((zone) => {
      const zoneBtn = document.createElement('button');
      zoneBtn.className = 'snap-preview';
      zoneBtn.style.cssText = `
        position:fixed;border:2px solid var(--accent);background:var(--accent-soft);
        border-radius:var(--r-md);cursor:pointer;pointer-events:auto;
        left:${wa.left + zone.x * wa.width}px;top:${wa.top + zone.y * wa.height}px;
        width:${zone.w * wa.width}px;height:${zone.h * wa.height}px;
        transition:transform var(--t-fast);`;
      zoneBtn.addEventListener('mouseenter', () => (zoneBtn.style.transform = 'scale(.97)'));
      zoneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.applyZone(win, zone);
        overlay.remove();
      });
      overlay.appendChild(zoneBtn);
    });

    const cancel = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
    document.body.appendChild(overlay);
    // Esc cancela
    const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  /** Aplica a zona calculada à janela. */
  applyZone(win, zone) {
    const wa = workArea();
    if (!win.maximized && !win.snapped) win.snapshot();
    win.maximized = false;
    win.el.classList.remove('maximized');
    win.snapped = zone.k;
    win.el.classList.add('snapped');
    win.setRect({
      left: Math.round(wa.left + zone.x * wa.width),
      top: Math.round(wa.top + zone.y * wa.height),
      width: Math.round(zone.w * wa.width),
      height: Math.round(zone.h * wa.height),
    });
    win.setMaxIcon(false);
    this.wm.focus(win.id);
    this.wm.bus.emit('window:snap', { id: win.id, zone: zone.k });
  }

  /** Detecta snap por drag (chamado durante o move). */
  detectDragSnap(clientX, clientY) {
    const margin = 12;
    const wa = workArea();
    // Bordas laterais -> meia tela
    if (clientX <= margin) return { k: 'left',   x: 0,   y: 0, w: .5, h: 1 };
    if (clientX >= window.innerWidth - margin) return { k: 'right', x: .5, y: 0, w: .5, h: 1 };
    // Topo -> maximizar
    if (clientY <= margin) return { k: 'max', x: 0, y: 0, w: 1, h: 1 };
    // Cantos -> quadrantes
    if (clientX <= margin && clientY <= margin) return { k: 'tl', x: 0, y: 0, w: .5, h: .5 };
    if (clientX >= window.innerWidth - margin && clientY <= margin) return { k: 'tr', x: .5, y: 0, w: .5, h: .5 };
    if (clientX <= margin && clientY >= window.innerHeight - margin) return { k: 'bl', x: 0, y: .5, w: .5, h: .5 };
    if (clientX >= window.innerWidth - margin && clientY >= window.innerHeight - margin) return { k: 'br', x: .5, y: .5, w: .5, h: .5 };
    return null;
  }

  /** Mostra preview visual durante o drag. */
  showPreview(zone) {
    this.hidePreview();
    if (!zone) return;
    if (zone.k === 'max') return; // max não tem preview de zona
    const wa = workArea();
    const el = document.createElement('div');
    el.className = 'snap-preview';
    el.style.left = (wa.left + zone.x * wa.width) + 'px';
    el.style.top = (wa.top + zone.y * wa.height) + 'px';
    el.style.width = (zone.w * wa.width) + 'px';
    el.style.height = (zone.h * wa.height) + 'px';
    document.body.appendChild(el);
    this._previewEl = el;
  }

  hidePreview() {
    this._previewEl?.remove();
    this._previewEl = null;
  }

  _dismissFlyout() {
    if (this._activeFlyout) {
      this._activeFlyout.el.remove();
      this._activeFlyout = null;
    }
  }
}

export const TASKBAR_H = TASKBAR;
export { SnapManager };
