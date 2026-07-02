/**
 * mathicx-file · ui/activity-log.js
 * Log de atividades do usuário — alimenta o widget "Atividades recentes"
 * e o dashboard. Mantém um buffer circular (últimas N) em memória + persiste.
 */

import { bus, EVT } from '../core/event-bus.js';
import { store } from '../core/state.js';

const MAX = 40;

const log = (entry) => {
  const record = { ts: Date.now(), ...entry };
  const current = store.get('activity', []);
  const next = [record, ...current].slice(0, MAX);
  store.set('activity', next);
  bus.emit(EVT.ACTIVITY_LOG, record);
  return record;
};

export const logActivity = (icon, label, meta) => log({ icon, label, meta });

// Inicialização: garante chave no store.
export const initActivityLog = () => {
  if (!store.get('activity')) store.set('activity', []);
};

export const getActivity = () => store.get('activity', []);
