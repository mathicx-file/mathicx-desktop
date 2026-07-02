/**
 * mathicx-file · window-manager/window.js
 * Model de uma janela. Encapsula estado e o elemento DOM, mas NÃO a lógica
 * de drag/resize (isso fica em interactions.js) — Single Responsibility.
 */

import { uid, clamp } from '../core/utils.js';
import { WIN_ICONS } from '../ui/components.js';

const TASKBAR = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-h')) || 56;

export class AppWindow {
  constructor({ appId, manifest, rect, layer }) {
    this.id = uid('win');
    this.appId = appId;
    this.manifest = manifest;
    this.layer = layer;

    this.minimized = false;
    this.maximized = false;
    this.snapped = null; // chave do snap ativo, ex: 'left','right','q-tl'
    this.prevRect = null;
    this.focused = false;
    this._cleanup = null; // cleanup retornado pela view do app

    this.rect = rect;
    this.el = this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.className = 'os-window opening';
    el.dataset.id = this.id;
    el.style.width = this.rect.width + 'px';
    el.style.height = this.rect.height + 'px';
    el.style.left = this.rect.left + 'px';
    el.style.top = this.rect.top + 'px';
    el.style.zIndex = this.rect.z ?? 100;

    el.innerHTML = `
      <div class="os-titlebar">
        <span class="os-title-icon">${this.manifest.icon}</span>
        <span class="os-title-text">${this.manifest.name}</span>
        <div class="os-controls">
          <button type="button" class="os-btn os-min" title="Minimizar">${WIN_ICONS.min}</button>
          <button type="button" class="os-btn os-max" title="Maximizar">${WIN_ICONS.max}</button>
          <button type="button" class="os-btn os-close" title="Fechar">${WIN_ICONS.close}</button>
        </div>
      </div>
      <div class="os-body"><div class="os-content"></div></div>
      <div class="os-resize n"></div><div class="os-resize s"></div>
      <div class="os-resize e"></div><div class="os-resize w"></div>
      <div class="os-resize ne"></div><div class="os-resize nw"></div>
      <div class="os-resize se"></div><div class="os-resize sw"></div>`;

    this.layer.appendChild(el);
    requestAnimationFrame(() => el.classList.remove('opening'));
    return el;
  }

  get contentEl() { return this.el.querySelector('.os-content'); }
  get titlebarEl() { return this.el.querySelector('.os-titlebar'); }

  setMaxIcon(maximized) {
    const btn = this.el.querySelector('.os-max');
    btn.innerHTML = maximized ? WIN_ICONS.restore : WIN_ICONS.max;
    btn.title = maximized ? 'Restaurar' : 'Maximizar';
  }

  /** Aplica um retângulo absoluto (px). */
  setRect({ left, top, width, height }) {
    const minW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--window-min-w')) || 320;
    const minH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--window-min-h')) || 240;
    if (width != null) this.el.style.width = Math.max(minW, width) + 'px';
    if (height != null) this.el.style.height = Math.max(minH, height) + 'px';
    if (left != null) this.el.style.left = left + 'px';
    if (top != null) this.el.style.top = clamp(top, 0, window.innerHeight - 40) + 'px';
    this.rect = {
      left: parseFloat(this.el.style.left),
      top: parseFloat(this.el.style.top),
      width: parseFloat(this.el.style.width),
      height: parseFloat(this.el.style.height),
    };
  }

  getRect() {
    return {
      left: this.el.offsetLeft,
      top: this.el.offsetTop,
      width: this.el.offsetWidth,
      height: this.el.offsetHeight,
    };
  }

  snapshot() {
    this.prevRect = this.getRect();
  }

  restoreSnapshot() {
    if (this.prevRect) this.setRect(this.prevRect);
  }

  destroy() {
    this._cleanup?.();
    this.el.classList.add('closing');
    return new Promise((r) => setTimeout(() => { this.el.remove(); r(); }, 140));
  }
}
