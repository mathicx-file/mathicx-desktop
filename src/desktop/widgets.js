/**
 * mathicx-file · desktop/widgets.js
 * Widgets do desktop: relógio, calendário, notas rápidas, tarefas, clima,
 * atividades recentes. Cada widget é autocontido; o desktop.js orquestra.
 */

import { bus, EVT } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { pad2, WEEKDAYS_SHORT, MONTHS, WEEKDAYS_LONG, cap, debounce } from '../core/utils.js';
import { ls } from '../storage/local-storage.js';
import { themeManager } from '../themes/theme-manager.js';
import { logActivity } from '../ui/activity-log.js';
import { authProvider } from '../auth/provider.js';
import { firestorePaths } from '../firebase/firestore-paths.js';

/* ============ Relógio (header do desktop) ============ */
export function tickClock(el) {
  const now = new Date();
  const hEl = el.querySelector('[data-el="h"]');
  const sEl = el.querySelector('[data-el="s"]');
  const dateEl = el.querySelector('[data-el="date"]');
  if (hEl) hEl.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  if (sEl) sEl.textContent = pad2(now.getSeconds());
  if (dateEl) {
    dateEl.textContent = cap(
      now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    );
  }
}

/* ============ Widget de Calendário ============ */
export function renderCalendarWidget(container) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  let html = '<div class="widget-cal"><div class="w-cal-grid">';
  WEEKDAYS_SHORT.forEach((d) => { html += `<div class="w-dow">${d}</div>`; });
  for (let i = firstDow - 1; i >= 0; i--) {
    html += `<div class="w-day dim">${prevDays - i}</div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate();
    html += `<div class="w-day${isToday ? ' today' : ''}">${d}</div>`;
  }
  html += '</div></div>';
  container.querySelector('[data-el="wbody"]').innerHTML = html;
}

/* ============ Widget de Notas Rápidas ============ */
export function initNotesWidget(container) {
  const ta = container.querySelector('[data-el="wnotes"]');
  if (ta) ta.value = ls.get('widget-notes', '');
  if (!ta) return;
  ta.addEventListener('input', debounce(() => {
    ls.set('widget-notes', ta.value);
  }, 400));
}

/* ============ Widget de Tarefas ============ */
export function initTasksWidget(container) {
  const input = container.querySelector('[data-el="wtaskinput"]');
  const list = container.querySelector('[data-el="wtasklist"]');
  if (!input || !list) return;

  const tasks = ls.get('widget-tasks', []);
  const render = () => {
    list.innerHTML = tasks.map((t, i) => `
      <div class="w-task ${t.done ? 'done' : ''}" data-idx="${i}">
        <input type="checkbox" ${t.done ? 'checked' : ''} data-act="toggle" />
        <span>${t.text}</span>
        <button class="w-btn w-close" data-act="del" style="margin-left:auto">✕</button>
      </div>`).join('');
  };
  render();

  list.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-act="toggle"]');
    const del = e.target.closest('[data-act="del"]');
    if (toggle) { const i = +toggle.closest('[data-idx]').dataset.idx; tasks[i].done = !tasks[i].done; ls.set('widget-tasks', tasks); render(); }
    if (del) { const i = +del.closest('[data-idx]').dataset.idx; tasks.splice(i, 1); ls.set('widget-tasks', tasks); render(); }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      tasks.unshift({ text: input.value.trim(), done: false });
      ls.set('widget-tasks', tasks);
      input.value = '';
      render();
    }
  });
}

/* ============ Widget de Clima (Open-Meteo, sem chave) ============ */
export function initWeatherWidget(container) {
  const tempEl = container.querySelector('[data-el="wtemp"]');
  const descEl = container.querySelector('[data-el="wdesc"]');
  const wrap = container;

  if (!('geolocation' in navigator)) { wrap.classList.add('is-hidden'); return; }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
      const data = await res.json();
      const temp = Math.round(data.current_weather.temperature);
      const info = weatherCodeInfo(data.current_weather.weathercode);
      if (tempEl) tempEl.textContent = `${temp}°C`;
      if (descEl) descEl.textContent = info[1];
    } catch { /* oculto em falha */ }
  }, () => { /* permissão negada */ }, { timeout: 8000, maximumAge: 600000 });
}

function weatherCodeInfo(code) {
  const m = {
    0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Poucas nuvens'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'],
    45: ['🌫️', 'Neblina'], 51: ['🌦️', 'Garoa'], 61: ['🌧️', 'Chuva'], 71: ['❄️', 'Neve'],
    80: ['🌦️', 'Aguaceiros'], 95: ['⛈️', 'Trovoada'],
  };
  return m[code] || ['🌡️', '—'];
}

/* ============ Widget de Atividades Recentes ============ */
export function renderActivitiesWidget(container) {
  const list = container.querySelector('[data-el="wacts"]');
  if (!list) return;

  const unsub = store.subscribe('activity', () => _renderActs(list));
  _renderActs(list);

  return () => unsub();
}

function _renderActs(listEl) {
  const acts = (store.get('activity') || []).slice(0, 5);
  if (!acts.length) { listEl.innerHTML = '<div style="font-size:11.5px;color:var(--muted);padding:8px 0;">Nenhuma atividade.</div>'; return; }
  listEl.innerHTML = acts.map((a) => {
    const ago = timeAgo(a.ts);
    return `<div class="w-act"><span>${a.icon} ${a.label}</span><span class="w-time">${ago}</span></div>`;
  }).join('');
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/* ============ Widget Japanese Study ============ */
export function initJapaneseStudyWidget(container) {
  const body = container.querySelector('[data-el="wbody"]');
  if (!body) return;

  body.innerHTML = `
    <div class="widget-japanese">
      <div class="wj-summary">
        <span class="wj-main">Carregando progresso...</span>
        <span class="wj-sub">Buscando dados sincronizados.</span>
      </div>
      <div class="wj-grid" aria-live="polite">
        <span><strong>--</strong><small>SRS</small></span>
        <span><strong>--</strong><small>Eventos</small></span>
        <span><strong>--</strong><small>Favoritos</small></span>
      </div>
      <div class="wj-actions">
        <button type="button" class="wj-action primary" data-jp-view="home">Estudar</button>
        <button type="button" class="wj-action" data-jp-view="quiz">Quiz</button>
        <button type="button" class="wj-action" data-jp-view="data">Sync</button>
      </div>
    </div>`;

  body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-jp-view]');
    if (!button) return;
    bus.emit(EVT.APP_LAUNCH, {
      appId: 'japanese-study',
      action: 'navigate',
      payload: { view: button.dataset.jpView },
    });
  });

  loadJapaneseStudySummary()
    .then((summary) => renderJapaneseStudySummary(body, summary))
    .catch((error) => {
      console.warn('[japanese-study-widget] falha ao carregar resumo', error);
      renderJapaneseStudySummary(body, {
        main: 'Resumo indisponivel',
        sub: 'Abra o app para sincronizar novamente.',
        srsItems: 0,
        events: 0,
        favorites: 0,
      });
    });
}

async function loadJapaneseStudySummary() {
  if (!authProvider.isFirebaseMode) {
    return {
      main: 'Japanese Study local',
      sub: 'Abra o app para revisar seus estudos.',
      srsItems: 0,
      events: 0,
      favorites: 0,
    };
  }

  const user = authProvider.getCurrentUser();
  if (!user?.uid || !authProvider.isApproved()) {
    return {
      main: 'Aguardando acesso',
      sub: 'Entre com uma conta aprovada para ver o resumo.',
      srsItems: 0,
      events: 0,
      favorites: 0,
    };
  }

  const [{ initFirebase }, firestoreApi] = await Promise.all([
    import('../firebase/firebase-client.js'),
    import('https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js'),
  ]);
  const services = await initFirebase({ force: true });
  const { doc, getDocFromServer } = firestoreApi;
  const [progressSnap, settingsSnap] = await Promise.all([
    getDocFromServer(doc(services.firestore, firestorePaths.japaneseProgression(user.uid))),
    getDocFromServer(doc(services.firestore, firestorePaths.japaneseSettings(user.uid))),
  ]);

  const progress = progressSnap.exists() ? progressSnap.data() : {};
  const settings = settingsSnap.exists() ? settingsSnap.data() : {};
  const srsItems = countObject(progress.srsItems);
  const events = countObject(progress.gamificationEvents);
  const favorites = countObject(progress.favorites) + countObject(progress.dictionaryFavorites);
  const updatedAt = resolveTimestamp(progress.updatedAt) || resolveTimestamp(settings.updatedAt);

  return {
    main: srsItems > 0 ? `${srsItems} itens no SRS` : 'Japanese Study sincronizado',
    sub: updatedAt ? `Atualizado ha ${timeAgo(updatedAt)}` : 'Abra o app para gerar o primeiro resumo.',
    srsItems,
    events,
    favorites,
  };
}

function renderJapaneseStudySummary(body, summary) {
  const main = body.querySelector('.wj-main');
  const sub = body.querySelector('.wj-sub');
  const counters = body.querySelectorAll('.wj-grid strong');

  if (main) main.textContent = summary.main;
  if (sub) sub.textContent = summary.sub;
  if (counters[0]) counters[0].textContent = String(summary.srsItems ?? 0);
  if (counters[1]) counters[1].textContent = String(summary.events ?? 0);
  if (counters[2]) counters[2].textContent = String(summary.favorites ?? 0);
}

function countObject(value) {
  if (!value || typeof value !== 'object') return 0;
  return Object.keys(value).length;
}

function resolveTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

/* ============ Construtor de widgets do dashboard ============ */
export const WIDGET_DEFS = [
  {
    id: 'clock', title: 'Relógio', icon: '🕐', default: true,
    body: (el) => {
      const now = new Date();
      el.querySelector('[data-el="wbody"]').innerHTML = `
        <div class="widget-clock">
          <span class="w-big">${pad2(now.getHours())}:${pad2(now.getMinutes())}</span>
          <span class="w-sub">${pad2(now.getSeconds())}s · ${cap(MONTHS[now.getMonth()])} ${now.getDate()}</span>
        </div>`;
    },
  },
  {
    id: 'cal', title: 'Calendário', icon: '📅', default: true,
    body: renderCalendarWidget,
  },
  {
    id: 'notes', title: 'Anotações', icon: '📝', default: true,
    body: (el) => { initNotesWidget(el); },
    template: `<div class="widget-notes"><textarea data-el="wnotes" placeholder="Escreva aqui..."></textarea></div>`,
  },
  {
    id: 'tasks', title: 'Tarefas', icon: '✅', default: true,
    body: (el) => { initTasksWidget(el); },
    template: `<div class="widget-tasks"><input data-el="wtaskinput" type="text" placeholder="Adicionar tarefa..." /><div data-el="wtasklist" style="margin-top:8px"></div></div>`,
  },
  {
    id: 'weather', title: 'Clima', icon: '🌡️', default: true,
    body: (el) => { initWeatherWidget(el); },
    template: `<div class="widget-weather"><span class="w-temp" data-el="wtemp">--°C</span> <span class="w-desc" data-el="wdesc">—</span></div>`,
  },
  {
    id: 'activity', title: 'Atividades', icon: '📊', default: true,
    body: (el) => { renderActivitiesWidget(el); },
    template: `<div class="widget-activity"><div data-el="wacts"></div></div>`,
  },
  {
    id: 'japanese-study', title: 'Japanese Study', icon: 'JP', default: true,
    body: (el) => { initJapaneseStudyWidget(el); },
  },
];
