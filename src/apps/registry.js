/**
 * mathicx-file · apps/registry.js
 * Registro central de apps. Cada app é independente (manifesto + view lazy).
 *
 * O registry conhece apenas os manifestos (metadata). A view (controller)
 * só é carregada via manifest.loader() no momento em que a janela abre,
 * garantindo lazy loading real.
 *
 * Adicionar um novo app = criar /apps/<id>/{manifest,view}.js e registrar
 * aqui. Nenhuma outra parte do sistema precisa mudar (Open/Closed).
 */

import { bus, EVT } from '../core/event-bus.js';

import calculadora from './calculadora/manifest.js';
import notas from './notas/manifest.js';
import arquivos from './arquivos/manifest.js';
import formularios from './formularios/manifest.js';
import configuracoes from './configuracoes/manifest.js';
import finanças from './finanças/manifest.js';
import admin from './admin/manifest.js';
import japaneseStudy from './japanese-study/manifest.js';

/** Catálogo de categorias disponíveis (para filtros do launcher). */
export const CATEGORIES = [
  { id: 'pessoal',    label: 'Pessoal',    color: 'var(--cat-pessoal)' },
  { id: 'trabalho',   label: 'Trabalho',   color: 'var(--cat-trabalho)' },
  { id: 'ferramenta', label: 'Ferramenta', color: 'var(--cat-ferramenta)' },
  { id: 'sistema',    label: 'Sistema',    color: 'var(--cat-sistema)' },
  { id: 'midia',      label: 'Mídia',      color: 'var(--cat-midia)' },
];

class AppRegistry {
  constructor() {
    /** Map id -> manifest */
    this._apps = new Map();
  }

  /** Registra um único app. */
  register(manifest) {
    if (!manifest?.id) throw new Error('App manifest precisa de id');
    this._apps.set(manifest.id, manifest);
    bus.emit(EVT.APP_INSTALLED, manifest);
    return manifest;
  }

  /** Registra todos os apps built-in. */
  registerAll() {
    [calculadora, notas, arquivos, formularios, configuracoes, finanças, admin, japaneseStudy]
      .forEach((m) => this.register(m));
  }

  get(id) { return this._apps.get(id); }
  has(id) { return this._apps.has(id); }

  /** Lista todos os manifestos (array). */
  list() { return [...this._apps.values()]; }

  /** Filtra por categoria. */
  byCategory(cat) {
    return cat === 'todas' || !cat ? this.list() : this.list().filter((a) => a.category === cat);
  }
}

export const appRegistry = new AppRegistry();
