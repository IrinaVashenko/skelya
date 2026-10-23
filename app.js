'use strict';

/* ================= Дані ================= */

const KEY = 'skelya:v1';
const HOUR_PX = 56;
const GUTTER = 52;
const RED = '#FF453A', YELLOW = '#FFD60A', GREEN = '#30D158', TRACK = '#26262A';

const CHALLENGES = {
  ux: { name: 'UX', color: '#2F7DFF' },
  ui: { name: 'UI', color: '#FF4FD8' },
  ai: { name: 'AI', color: '#C6FF3A' },
  en: { name: 'English', color: '#F2C48D' },
  mk: { name: 'Маркетинг', color: '#FF8A1F' },
  ua: { name: 'Українська', color: '#A78BFF' },
  vs: { name: 'Насмотреність', color: '#3DE8E0' },
};

const LOCK_SVG = '<svg class="lock" viewBox="0 0 24 24" aria-label="фіксована"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const CHECK_SVG = '<svg class="ic-done" viewBox="0 0 24 24" aria-label="зроблено"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const MISS_SVG = '<svg class="ic-miss" viewBox="0 0 24 24" aria-label="не зроблено"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const PIN_SVG = '<svg class="ic-pin" viewBox="0 0 24 24" aria-label="час старту"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/></svg>';

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return todayKey(new Date(y, m - 1, d + n)); };
const weekdayOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const dayLabel = (key) => {
  if (key === 'backlog') return 'без дати';
  const [y, m, d] = key.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' });
  return key === todayKey() ? `сьогодні, ${s}` : key === addDays(todayKey(), 1) ? `завтра, ${s}` : s;
};
const minOfDay = (ts) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const nowMin = () => minOfDay(Date.now());
const hhmm = (m) => { m = Math.round(m); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };
const parseHHMM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const dur = (m) => {
  m = Math.round(m);
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} год ${r} хв` : `${h} год`;
};
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
};

const isFlex = (t) => t.type === 'work' || t.type === 'learn';
const plan = (t) => t.minutes + (t.extra || 0);
const pausedMs = (t) => (t.pauses || []).reduce((s, p) => s + p.end - p.start, 0);
// Чистий час роботи над задачею, без пауз
const elapsedMs = (t) => (t.pausedAt || t.finishedAt || Date.now()) - t.startedAt - pausedMs(t);
const PAUSE_REASONS = ['Дзвінок', 'Термінова задача', 'Відійшла', 'Інше'];
const taskColor = (t) => (t.challenge && CHALLENGES[t.challenge] ? CHALLENGES[t.challenge].color : null);
const active = () => state.tasks.find((t) => t.status === 'active');
// Наступна — та, що в плані стоїть найраніше (а не перша в списку)
const nextTask = () => { const b = schedule().find((x) => isFlex(x.t) && x.t.status === 'todo'); return b ? b.t : null; };

// dayStart — початок дня і роботи, workEnd — кінець роботи, dayEnd — межа дня
const DEFAULTS = { dayStart: 600, workEnd: 1020, dayEnd: 1260, workDays: [1, 2, 3, 4, 5] };
const WEEKDAYS = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Нд']];
const isWorkday = () => state.settings.workDays.includes(new Date().getDay());

// Постійний розклад тижня. Особистий розклад не зберігаємо в коді (він публічний):
// його вставляють рядками 🔁 через «Вставити план з Claude» або додають у «Мій розклад»
const defaultRoutine = () => [
  { id: uid(), title: 'Обід', days: [1, 2, 3, 4, 5], at: 13 * 60, minutes: 60, type: 'break' },
];

// Блоки розкладу на конкретний день
function routineFor(key) {
  const wd = weekdayOf(key);
  return state.routine.filter((r) => r.days.includes(wd)).map((r) => ({
    id: `r:${r.id}`, rid: r.id, title: r.title, type: r.type, fixedStart: r.at, minutes: r.minutes,
    challenge: r.challenge, status: 'todo', virtual: true,
  }));
}

const freshFlags = () => ({ workEndAsked: false, moved: [] });

function resetTask(t) {
  return {
    ...t, status: 'todo', startedAt: null, finishedAt: null, extra: 0, warned15: false, warnedEnd: false, lastNag: 0, lateAck: false,
    pausedAt: null, pauseReason: null, pauses: [], pauseNagged: false,
  };
}

// Новий день: незакінчені задачі й заплановані на сьогодні переходять у план
function rollover(s) {
  const key = todayKey();
  // Час старту стосувався вчора — на новий день задача йде без нього
  const carry = s.tasks.filter((t) => isFlex(t) && t.status !== 'done').map((t) => { const r = resetTask(t); delete r.startAt; return r; });
  const planned = (s.future[key] || []).map(resetTask);
  const future = {};
  for (const [k, v] of Object.entries(s.future)) if (k > key) future[k] = v;

  // Знімок минулого дня для календаря: що було в плані і що зроблено
  const history = { ...(s.history || {}) };
  const snap = (t) => ({
    id: t.id, title: t.title, type: t.type, challenge: t.challenge, minutes: t.minutes,
    done: t.status === 'done',
    fact: t.status === 'done' && t.startedAt ? Math.round(elapsedMs(t) / 60000) : 0,
    at: t.startedAt ? Math.round(minOfDay(t.startedAt)) : (t.fixedStart ?? t.startAt ?? null),
  });
  if (s.tasks.length) history[s.date] = s.tasks.map(snap);
  for (const [k, v] of Object.entries(s.future)) if (k < key && v.length) history[k] = v.map(snap);
  for (const k of Object.keys(history)) if (k < addDays(key, -120)) delete history[k];

  return { ...s, date: key, tasks: [...carry, ...planned], future, history, flags: freshFlags() };
}

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* немає сховища */ }
  if (!s || !Array.isArray(s.tasks)) s = { date: todayKey(), tasks: [] };
  // Перенесення зі старої версії: «на завтра» → future, обід → розклад
  if (!s.future) s.future = {};
  if (Array.isArray(s.later) && s.later.length) {
    const k = addDays(s.date, 1);
    s.future[k] = [...(s.future[k] || []), ...s.later];
  }
  delete s.later;
  if (!Array.isArray(s.backlog)) s.backlog = [];
  if (!s.history) s.history = {};
  if (!Array.isArray(s.routine)) s.routine = defaultRoutine();
  const { lunchOn, lunchStart, lunchMin, ...rest } = s.settings || {};
  s.settings = { ...DEFAULTS, ...rest };
  if (!s.flags) s.flags = freshFlags();
  if (s.date !== todayKey()) s = rollover(s);
  return s;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* приватний режим */ }
}

let state = load();

// Список задач дня: сьогодні, майбутній день або «Без дати» (backlog)
function listFor(key) {
  if (key === todayKey()) return state.tasks;
  if (key === 'backlog') return state.backlog;
  return (state.future[key] = state.future[key] || []);
}

function findTask(id) {
  if (state.tasks.some((t) => t.id === id)) return { task: state.tasks.find((t) => t.id === id), key: todayKey() };
  const b = state.backlog.find((t) => t.id === id);
  if (b) return { task: b, key: 'backlog' };
  for (const [k, list] of Object.entries(state.future)) {
    const t = list.find((x) => x.id === id);
    if (t) return { task: t, key: k };
  }
  return null;
}

function removeTask(id) {
  const f = findTask(id);
  if (!f) return;
  const list = listFor(f.key);
  list.splice(list.indexOf(f.task), 1);
}

function moveToTomorrow(t) {
  const k = addDays(todayKey(), 1);
  state.tasks = state.tasks.filter((x) => x !== t);
  const moved = resetTask(t);
  delete moved.startAt;
  (state.future[k] = state.future[k] || []).push(moved);
  state.flags.moved.push(t.title);
}

/* ================= Розклад ================= */

// Розставляє задачі на сьогодні: фіксовані стоять на місці, гнучкі йдуть одна за одною і обтікають фіксовані
function schedule() {
  const now = nowMin();
  const { dayStart } = state.settings;
  const fixed = [...state.tasks.filter((t) => !isFlex(t)), ...routineFor(todayKey())]
    .map((t) => ({ t, start: t.fixedStart, end: t.fixedStart + t.minutes }));
  const out = [...fixed];
  let cursor = Math.max(dayStart, now);

  for (const t of state.tasks.filter(isFlex)) {
    if (t.status === 'done') {
      out.push(...pieces(t, t.finishedAt));
    } else if (t.status === 'active') {
      // Кінець = зараз + скільки лишилось за планом (пауза зсуває його далі)
      const endMs = Date.now() + Math.max(0, plan(t) * 60000 - elapsedMs(t));
      out.push(...pieces(t, endMs));
      cursor = Math.max(cursor, minOfDay(endMs));
    }
  }

  // Задачі з часом старту стоять на своєму місці (якщо цей час ще не минув),
  // решта йде одна за одною і обтікає їх так само, як фіксовані події
  const todo = state.tasks.filter((x) => isFlex(x) && x.status === 'todo');
  const anchored = todo.filter((t) => t.startAt != null && t.startAt >= cursor)
    .map((t) => ({ t, start: t.startAt, end: t.startAt + t.minutes }));
  out.push(...anchored);
  const obstacles = [...fixed, ...anchored];
  for (const t of todo.filter((x) => !anchored.some((a) => a.t === x))) {
    let s = cursor;
    for (let guard = 0; guard < 30; guard++) {
      const f = obstacles.find((x) => x.start < s + t.minutes && x.end > s);
      if (!f) break;
      s = f.end;
    }
    out.push({ t, start: s, end: s + t.minutes });
    cursor = s + t.minutes;
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

// Розклад іншого дня: та сама логіка, але без «зараз» і без задач у процесі
function scheduleFor(key) {
  if (key === todayKey()) return schedule();
  const list = listFor(key);
  const fixed = [...list.filter((t) => !isFlex(t)), ...routineFor(key)]
    .map((t) => ({ t, start: t.fixedStart, end: t.fixedStart + t.minutes }));
  const todo = list.filter(isFlex);
  const anchored = todo.filter((t) => t.startAt != null).map((t) => ({ t, start: t.startAt, end: t.startAt + t.minutes }));
  const out = [...fixed, ...anchored];
  const obstacles = [...out];
  let cursor = state.settings.dayStart;
  for (const t of todo.filter((x) => x.startAt == null)) {
    let s = cursor;
    for (let guard = 0; guard < 30; guard++) {
      const f = obstacles.find((x) => x.start < s + t.minutes && x.end > s);
      if (!f) break;
      s = f.end;
    }
    out.push({ t, start: s, end: s + t.minutes });
    cursor = s + t.minutes;
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

// Завантаженість дня для смуги тижня і крапок місяця
function dayLoad(key) {
  const { dayStart, dayEnd } = state.settings;
  const cap = dayEnd - dayStart;
  if (key < todayKey()) {
    const h = state.history[key] || [];
    const busy = h.reduce((s, x) => s + (x.done ? x.fact || x.minutes : 0), 0);
    return { ratio: busy / cap, over: false, work: h.some((x) => x.type === 'work'), learn: h.some((x) => x.type === 'learn'), count: h.filter(isFlex).length };
  }
  const blocks = scheduleFor(key).filter((b) => b.t.type !== 'interrupt');
  const busy = blocks.reduce((s, b) => s + Math.max(0, Math.min(b.end, dayEnd) - Math.max(b.start, dayStart)), 0);
  const list = listFor(key);
  return {
    ratio: busy / cap,
    over: busy > cap || blocks.some((b) => isFlex(b.t) && b.t.status === 'todo' && b.end > dayEnd),
    work: list.some((t) => t.type === 'work'),
    learn: list.some((t) => t.type === 'learn' || (t.type === 'fixed' && t.challenge)),
    count: list.filter(isFlex).length,
  };
}

// Задача з паузами розрізається: шматок роботи → перерва → продовження
function pieces(t, endMs) {
  const res = [];
  const seg = (a, b, extra = {}) => {
    // Блок закінчується рівно тоді, коли закінчилась робота (без штучного мінімуму),
    // інакше він «перетинається» з наступною задачею і показується як конфлікт
    const s = minOfDay(a), e = Math.max(minOfDay(b), s + 0.5);
    res.push({ t, start: s, end: e, ...extra });
  };
  const gap = (p, open) => {
    const s = minOfDay(p.start), e = minOfDay(open ? Date.now() : p.end);
    if (e - s < 1) return;
    res.push({ t: { id: `i:${t.id}:${p.start}`, title: p.reason || 'Перервали', type: 'interrupt', status: 'done' }, start: s, end: e });
  };
  let cur = t.startedAt;
  for (const p of t.pauses || []) {
    if (p.start - cur >= 30000) seg(cur, p.start);
    gap(p, false);
    cur = p.end;
  }
  if (t.pausedAt) {
    if (t.pausedAt - cur >= 30000) seg(cur, t.pausedAt);
    gap({ start: t.pausedAt, reason: t.pauseReason }, true);
    seg(Date.now(), endMs, { cont: true });
  } else {
    seg(cur, endMs);
  }
  return res;
}

// Блоки, що перетинаються, стають колонками поруч і позначаються як конфлікт
function layout(blocks) {
  const res = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const cols = [];
    for (const b of cluster) {
      let i = cols.findIndex((end) => end <= b.start);
      if (i < 0) { i = cols.length; cols.push(0); }
      cols[i] = b.end;
      b.col = i;
    }
    for (const b of cluster) { b.cols = cols.length; b.conflict = cols.length > 1; }
    res.push(...cluster);
    cluster = [];
  };
  for (const b of blocks) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return res;
}

// Вільні вікна від «зараз» до межі дня
function gaps(blocks) {
  const { dayStart, dayEnd } = state.settings;
  let c = Math.max(nowMin(), dayStart);
  const g = [];
  for (const b of blocks) {
    if (b.end <= c) continue;
    if (b.start > c) g.push({ start: c, end: Math.min(b.start, dayEnd) });
    c = Math.max(c, b.end);
  }
  if (c < dayEnd) g.push({ start: c, end: dayEnd });
  return g.filter((x) => x.end - x.start >= 1);
}

/* ================= Відображення ================= */

const els = {
  date: $('#date'), count: $('#count'), arc: $('#arc'), ringTime: $('#ringTime'), ringSub: $('#ringSub'),
  heroActions: $('#heroActions'), grid: $('#grid'), free: $('#free'), hours: $('#hours'), nudge: $('#nudge'),
  calm: $('#calm'), ringBox: $('#ringBox'), planSection: $('#planSection'),
  viewToday: $('#viewToday'), viewTasks: $('#viewTasks'),
  mini: $('#mini'), miniArc: $('#miniArc'), miniTime: $('#miniTime'), miniTotal: $('#miniTotal'),
  overlay: $('#overlay'), sheet: $('#sheet'), toast: $('#toast'),
};
const C_BIG = 2 * Math.PI * 93, C_MINI = 2 * Math.PI * 15;
els.arc.style.strokeDasharray = C_BIG;
els.miniArc.style.strokeDasharray = C_MINI;

const extendChips = (list = [15, 20, 30]) =>
  `<div class="chips">${list.map((m) => `<button class="btn-quiet" data-action="extend" data-min="${m}">+${m >= 60 ? `${m / 60} год` : m}</button>`).join('')}
   <button class="btn-quiet icon" data-action="custom" aria-label="Свій час">${PLUS_SVG}</button></div>`;

const PAUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';

function renderHero() {
  const act = active(), next = nextTask();
  const flex = state.tasks.filter(isFlex);
  const empty = !flex.length;
  els.calm.hidden = !empty;
  els.ringBox.hidden = empty;
  if (act && act.pausedAt) {
    // Явно пишемо, яка задача на паузі і що означає кожна кнопка
    els.heroActions.innerHTML = `<p class="pause-note"><b>«${esc(act.title)}»</b> на паузі${act.pauseReason ? ` · ${esc(act.pauseReason)}` : ''}.<br>
        Час паузи в задачу не рахується — він піде у звіт як перерва.</p>
      <button class="btn-pearl" data-action="resume">Продовжити задачу</button>
      <button class="btn-quiet lg" data-action="done">Задачу завершено</button>
      <button class="link-quiet" data-action="pause-reason">${act.pauseReason ? 'Змінити причину' : 'Вказати причину'}</button>`;
  } else if (act) {
    els.heroActions.innerHTML = `<div class="row-main"><button class="btn-quiet icon" data-action="pause" aria-label="Пауза">${PAUSE_SVG}</button>
      <button class="btn-pearl" data-action="done">Готово</button></div>${extendChips()}`;
  } else if (next) {
    els.heroActions.innerHTML = `<button class="btn-pearl" data-action="start" data-id="${next.id}">Почати</button>`;
  } else if (!empty) {
    els.heroActions.innerHTML = '';
  } else {
    els.heroActions.innerHTML = `<div class="calm-text"><h2>Почнімо спокійно</h2>
        <p>Додай першу задачу або встав список, який склала разом зі Скелею в Claude.</p></div>
      <button class="btn-pearl" data-action="add">Додати першу задачу</button>
      <button class="btn-quiet lg" data-action="import">Вставити список з Claude</button>
      <button class="link-quiet" data-action="demo">або подивись демо-день</button>`;
  }
}

// Оновлюється щосекунди: кільце, час, компактна панель
function tick() {
  const act = active();
  let p = 0, color = TRACK, time = '—', sub = '';
  const flex = state.tasks.filter(isFlex);
  const done = flex.filter((t) => t.status === 'done').length;

  if (act && act.pausedAt) {
    const el = elapsedMs(act), pl = plan(act) * 60000;
    p = el / pl;
    color = '#8E8E93';
    time = clock(Date.now() - act.pausedAt);
    sub = `пауза · зроблено ${clock(el)}`;
    els.miniTime.textContent = time;
    els.miniTotal.textContent = 'пауза';
    checkPauseNag(act);
  } else if (act) {
    const el = elapsedMs(act), pl = plan(act) * 60000;
    p = el / pl;
    if (p > 1) {
      color = RED; time = `+${clock(el - pl)}`; sub = `понад план ${dur(plan(act))}`;
    } else {
      color = p < 0.33 ? RED : p < 0.8 ? YELLOW : GREEN;
      time = clock(el); sub = `з ${dur(plan(act))}`;
    }
    els.miniTime.textContent = p > 1 ? time : clock(el);
    els.miniTotal.textContent = p > 1 ? 'понад план' : `/ ${Math.round(plan(act))} хв`;
    checkWarnings(act, el, pl);
  } else {
    if (nextTask()) { time = dur(nextTask().minutes); sub = 'наступна задача'; }
    else if (flex.length) { p = 1; color = GREEN; time = '✓'; sub = 'усе закрито'; }
    else sub = 'план порожній';
    checkWorkEnd();
  }

  document.documentElement.style.setProperty('--ring', color);
  const off = (c) => c * (1 - Math.min(Math.max(p, 0), 1));
  els.arc.style.strokeDashoffset = off(C_BIG);
  els.miniArc.style.strokeDashoffset = off(C_MINI);
  els.ringTime.textContent = time;
  els.ringTime.style.fontSize = time.length > 6 ? '46px' : '';
  els.ringSub.textContent = sub;
  els.count.textContent = flex.length ? `${Math.min(done + (act ? 1 : 0), flex.length)} з ${flex.length}` : '';
  updateMini();
}

function renderGrid() {
  const g = els.grid;
  const blocksRaw = schedule();
  // Нагадування: навчання щодня
  const hasLearn = state.tasks.some((t) => t.type === 'learn');
  els.nudge.hidden = hasLearn || !state.tasks.length;
  if (!blocksRaw.length) {
    g.style.height = '';
    g.innerHTML = '<p class="empty">Сплануй день разом зі Скелею в Claude і встав план, або додай задачі вручну кнопкою «+» внизу.</p>';
    els.free.textContent = '';
    return;
  }
  const blocks = layout(blocksRaw);
  const { dayStart, dayEnd } = state.settings;
  const lo = Math.floor(Math.min(dayStart, ...blocks.map((b) => b.start)) / 60) * 60;
  const hi = Math.ceil(Math.max(dayEnd, ...blocks.map((b) => b.end)) / 60) * 60;
  const y = (m) => ((m - lo) / 60) * HOUR_PX;
  const act = active(), next = !act && nextTask();
  let h = '';

  if (isWorkday()) {
    const ws = state.settings.dayStart, we = state.settings.workEnd;
    h += `<div class="workband" style="top:${y(ws)}px;height:${y(we) - y(ws)}px"></div>
      <div class="workend" style="top:${y(we)}px"></div>`;
  }

  for (let m = lo; m <= hi; m += 60) h += `<div class="hour" style="top:${y(m)}px"><span>${hhmm(m)}</span></div>`;

  // Короткий блок малюємо вищим, ніж його реальний час, щоб влізла назва.
  // Якщо наступний блок у тій самій колонці стоїть впритул, він трохи зсувається вниз
  // (як у календарях) — точний час однаково підписаний у блоці.
  const MIN_H = 22;
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const rects = new Map();
  const colBottom = {};
  for (const b of sorted) {
    const keys = b.cols === 1 ? Object.keys(colBottom) : ['all', String(b.col)];
    const prev = Math.max(-Infinity, ...keys.map((k) => colBottom[k] ?? -Infinity), colBottom.all ?? -Infinity);
    const t0 = Math.max(y(b.start) + 1, prev + 2);
    const hgt = Math.max(y(b.end) - y(b.start) - 2, MIN_H);
    rects.set(b, { top: t0, h: hgt });
    colBottom[b.cols === 1 ? 'all' : String(b.col)] = t0 + hgt;
    if (b.cols === 1) for (const k of Object.keys(colBottom)) colBottom[k] = Math.max(colBottom[k], t0 + hgt);
  }
  const top = (b) => rects.get(b).top;
  const bottom = (b) => top(b) + rects.get(b).h;

  // Вільне вікно можна натиснути, щоб додати в нього задачу.
  // Воно починається нижче за будь-який блок над ним, тож ніколи на них не налазить.
  const free = gaps(blocks);
  for (const x of free) {
    if (x.end - x.start < 15) continue;
    let gTop = y(x.start) + 1;
    for (const b of blocks) if (top(b) <= gTop && bottom(b) > gTop) gTop = bottom(b) + 3;
    const gBottom = y(x.end) - 1;
    if (gBottom - gTop < 20) continue;
    h += `<button class="gap" data-action="gap" data-start="${x.start}" data-len="${Math.round(x.end - x.start)}"
      style="top:${gTop}px;height:${gBottom - gTop}px" aria-label="Додати задачу у вільне вікно">
      <span>вільно ${dur(x.end - x.start)}</span>${PLUS_SVG}</button>`;
  }

  for (const b of blocks) {
    const t = b.t, color = taskColor(t);
    const cls = ['block', t.type];
    if (color) cls.push('tinted');
    if (t.status === 'done') cls.push('done');
    if (t === act) cls.push('current');
    if (t === next) cls.push('next');
    if (b.conflict) cls.push('conflict');
    if (b.cont) cls.push('part-next');
    const ht = bottom(b) - top(b);
    if (ht < 20) cls.push('tiny');
    if (t.type === 'interrupt') {
      h += `<div class="${cls.join(' ')}" style="top:${y(b.start) + 1}px;height:${ht}px;left:${GUTTER}px;width:calc(100% - ${GUTTER}px)">
        <span class="bt">${esc(t.title)} · ${dur(b.end - b.start)}</span></div>`;
      continue;
    }
    const w = `calc((100% - ${GUTTER}px) / ${b.cols} - 3px)`;
    const l = `calc(${GUTTER}px + (100% - ${GUTTER}px) / ${b.cols} * ${b.col})`;
    const isDone = t.status === 'done';
    const pinned = t.status === 'todo' && t.startAt != null && b.start === t.startAt;
    const meta = isDone
      ? `зроблено · ${dur(elapsedMs(t) / 60000)}`
      : `${hhmm(b.start)}–${hhmm(b.end)}${t.extra ? ` · +${t.extra} хв` : ''}`;
    // Зроблена коротка задача: галочка, назва і час в одному рядку
    const label = isDone
      ? `${CHECK_SVG}${esc(t.title)}${ht <= 36 ? ` <em>· ${dur(elapsedMs(t) / 60000)}</em>` : ''}`
      : `${pinned ? PIN_SVG : ''}${esc(t.title)}${t.type === 'fixed' ? LOCK_SVG : ''}`;
    h += `<button class="${cls.join(' ')}" data-action="open" data-id="${t.id}"
      style="top:${top(b)}px;height:${ht}px;left:${l};width:${w};${color ? `--c:${color}` : ''}">
      <span class="bt">${label}</span>${ht > 36 ? `<small>${meta}</small>` : ''}</button>`;
  }

  const n = nowMin();
  if (n >= lo && n <= hi) h += `<div class="now" style="top:${y(n)}px"></div>`;

  g.style.height = `${y(hi) + 12}px`;
  g.innerHTML = h;
  const total = free.reduce((s, x) => s + x.end - x.start, 0);
  els.free.textContent = total >= 1 ? `вільно ${dur(total)}` : 'вільного часу немає';
}

function renderAll() {
  const d = new Date();
  els.date.textContent = d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' });
  const s = state.settings;
  els.hours.textContent = isWorkday()
    ? `робота ${hhmm(s.dayStart)}–${hhmm(s.workEnd)} · до ${hhmm(s.dayEnd)}`
    : `вихідний · до ${hhmm(s.dayEnd)}`;
  // Поки немає жодних задач (ні сьогодні, ні в майбутньому, ні без дати) — тільки Скеля і дві дії
  const noData = !state.tasks.length && !state.backlog.length && !Object.values(state.future).some((l) => l.length);
  els.planSection.hidden = !state.tasks.length;
  document.body.classList.toggle('is-empty', noData);
  if (noData) view = 'today';
  els.viewToday.hidden = view !== 'today';
  els.viewTasks.hidden = view !== 'tasks';
  document.querySelectorAll('.tab[data-tab]').forEach((b) => {
    const on = b.dataset.tab === view;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  renderHero();
  renderGrid();
  if (view === 'tasks') renderTasks();
  tick();
}

/* ================= Екран «Задачі»: тиждень, місяць, список дня, без дати ================= */

let view = 'today';
const cal = { mode: 'week', sel: todayKey() };
const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const keyOf = (y, m, d) => todayKey(new Date(y, m, d));
const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const mondayOf = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));
const PREV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const NEXT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

function loadBar(l) {
  const w = Math.min(100, Math.round(l.ratio * 100));
  return `<span class="load"><i style="width:${w}%;${l.over ? 'background:var(--red)' : ''}"></i></span>`;
}

function renderTasks() {
  const sel = cal.sel, today = todayKey();
  const [y, m] = sel.split('-').map(Number);
  let h = `<header class="cal-head"><h1>${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}</h1>
    ${sel !== today ? '<button class="link" data-action="cal-today">Сьогодні</button>' : ''}</header>
    <div class="seg" role="tablist">
      <button class="${cal.mode === 'week' ? 'on' : ''}" data-action="cal-mode" data-mode="week">Тиждень</button>
      <button class="${cal.mode === 'month' ? 'on' : ''}" data-action="cal-mode" data-mode="month">Місяць</button></div>`;

  if (cal.mode === 'week') {
    const mon = mondayOf(sel);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    const d0 = dateOf(mon), d6 = dateOf(days[6]);
    const range = d0.getMonth() === d6.getMonth()
      ? `${d0.getDate()}–${d6.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}`
      : `${d0.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })} – ${d6.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}`;
    h += `<div class="cal-nav"><button class="btn-quiet icon" data-action="cal-shift" data-n="-7" aria-label="Попередній тиждень">${PREV_SVG}</button>
      <span>${range}</span><button class="btn-quiet icon" data-action="cal-shift" data-n="7" aria-label="Наступний тиждень">${NEXT_SVG}</button></div>
      <div class="week">${days.map((k, i) => {
        const d = Number(k.slice(8));
        return `<button class="wd${k === sel ? ' on' : ''}${k === today ? ' today' : ''}${k < today ? ' past' : ''}" data-action="cal-pick" data-key="${k}">
          <span class="wn">${WEEKDAYS[i][1]}</span><b>${d}</b>${loadBar(dayLoad(k))}</button>`;
      }).join('')}</div>`;
  } else {
    const first = keyOf(y, m - 1, 1);
    const offset = (weekdayOf(first) + 6) % 7;
    const total = new Date(y, m, 0).getDate();
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span></span>';
    for (let d = 1; d <= total; d++) {
      const k = keyOf(y, m - 1, d);
      const l = dayLoad(k);
      const dots = [l.work ? '<i class="dw"></i>' : '', l.learn ? '<i class="dl"></i>' : '', l.over ? '<i class="dr"></i>' : ''].join('');
      cells += `<button class="md${k === sel ? ' on' : ''}${k === today ? ' today' : ''}${k < today ? ' past' : ''}" data-action="cal-pick" data-key="${k}">
        ${d}<span class="dots">${dots}</span></button>`;
    }
    h += `<div class="cal-nav"><button class="btn-quiet icon" data-action="cal-month" data-n="-1" aria-label="Попередній місяць">${PREV_SVG}</button>
      <span>${MONTHS[m - 1]} ${y}</span><button class="btn-quiet icon" data-action="cal-month" data-n="1" aria-label="Наступний місяць">${NEXT_SVG}</button></div>
      <div class="month">${WEEKDAYS.map(([, n]) => `<span class="mh">${n}</span>`).join('')}${cells}</div>
`;
  }

  h += dayListHtml(sel);

  const bl = state.backlog;
  h += `<section class="cal-section"><div class="cal-day-head"><h2>Без дати${bl.length ? ` · ${bl.length}` : ''}</h2></div>
    ${bl.length ? bl.map((t) => `<button class="cal-row" data-action="open" data-id="${t.id}">
      <span class="ct"></span><span class="cn">${taskColor(t) ? `<span class="dot" style="background:${taskColor(t)}"></span>` : ''}${esc(t.title)}</span>
      <span class="cd">${dur(t.minutes)}</span></button>`).join('')
    : '<p class="empty">Тут живуть задачі «колись». Додай через «+» і обери «Без дати».</p>'}
</section>`;

  els.viewTasks.innerHTML = h;
}

function dayListHtml(key) {
  const today = todayKey();
  let rows = '', summary = '';
  if (key < today) {
    const h = [...(state.history[key] || [])].sort((a, b) => (a.at ?? 9999) - (b.at ?? 9999));
    const done = h.filter((x) => x.done).length, flex = h.filter(isFlex).length;
    summary = h.length ? `зроблено ${done} з ${flex}` : '';
    rows = h.map((x) => `<div class="cal-row hist${x.done ? ' ok' : ' miss'}">
      <span class="ct">${x.at != null ? hhmm(x.at) : ''}</span>
      <span class="cn">${x.done ? CHECK_SVG : MISS_SVG}${esc(x.title)}</span>
      <span class="cd">${x.done ? dur(x.fact || x.minutes) : 'не зроблено'}</span></div>`).join('');
    if (!h.length) rows = '<p class="empty">Про цей день немає записів.</p>';
  } else {
    const seen = new Set();
    const blocks = scheduleFor(key).filter((b) => b.t.type !== 'interrupt' && !seen.has(b.t.id) && seen.add(b.t.id));
    const l = dayLoad(key);
    const flexMin = listFor(key).filter(isFlex).reduce((s, t) => s + t.minutes, 0);
    summary = l.count ? `${l.count} ${l.count === 1 ? 'задача' : l.count < 5 ? 'задачі' : 'задач'} · ${dur(flexMin)}` : '';
    rows = blocks.map((b) => {
      const t = b.t, c = taskColor(t);
      const icon = t.status === 'done' ? CHECK_SVG : t.status === 'active' ? '<span class="live"></span>' : t.startAt != null && isFlex(t) ? PIN_SVG : '';
      return `<button class="cal-row${t.virtual || t.type === 'break' ? ' quiet' : ''}${t.status === 'done' ? ' ok' : ''}${isFlex(t) && b.end > state.settings.dayEnd ? ' late' : ''}" data-action="open" data-id="${t.id}">
        <span class="ct">${hhmm(b.start)}</span>
        <span class="cn">${icon}${c ? `<span class="dot" style="background:${c}"></span>` : ''}${esc(t.title)}${t.type === 'fixed' ? LOCK_SVG : ''}</span>
        <span class="cd">${dur(t.minutes)}</span></button>`;
    }).join('') || '<p class="empty">На цей день нічого не заплановано.</p>';
    if (l.over) summary += `${summary ? ' · ' : ''}<span class="warn">не вміщається</span>`;
  }
  // Коротко: «Сьогодні», «Завтра» або «Пн, 26 жовтня» (дату й так видно в календарі)
  const label = key === today ? 'Сьогодні' : key === addDays(today, 1) ? 'Завтра'
    : dateOf(key).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase());
  return `<section class="cal-section"><div class="cal-day-head"><h2>${label}</h2><span>${summary}</span></div>
    ${rows}</section>`;
}

/* Компактна панель: видно, коли великий таймер прокручено */
let heroVisible = true;
function updateMini() {
  const on = !heroVisible && !!active();
  els.mini.classList.toggle('on', on);
  els.mini.setAttribute('aria-hidden', String(!on));
}
new IntersectionObserver((entries) => {
  heroVisible = entries[0].isIntersecting;
  updateMini();
}, { rootMargin: '-60px 0px 0px 0px' }).observe($('.ring'));

/* ================= Звук ================= */

let audio = null;
function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { /* звук недоступний */ }
}
function beep(times = 1) {
  if (navigator.vibrate) navigator.vibrate(times > 1 ? [200, 120, 200] : 200);
  if (!audio) return;
  for (let i = 0; i < times; i++) {
    const o = audio.createOscillator(), g = audio.createGain();
    const t = audio.currentTime + i * 0.35;
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.32);
  }
}
document.addEventListener('pointerdown', unlockAudio);

/* ================= Попередження (04-flows.md) ================= */

function checkWarnings(act, el, pl) {
  if (sheetOpen()) return;
  const rem = pl - el;
  if (!act.warned15 && plan(act) > 20 && rem <= 15 * 60000 && rem > 0) {
    act.warned15 = true; save(); beep(); openWarn('15');
  } else if (!act.warnedEnd && rem <= 0) {
    act.warnedEnd = true; act.lastNag = Date.now(); save(); beep(2); openWarn('end');
  } else if (act.warnedEnd && rem < 0 && Date.now() - act.lastNag >= 5 * 60000) {
    act.lastNag = Date.now(); save(); beep(2); openWarn('nag', el - pl);
  }
}

const WARN_ICON = (c) => `<svg class="warn-icon" viewBox="0 0 24 24" style="color:${c}" aria-hidden="true"><path d="M6 2h12M6 22h12M7 2c0 5 10 5 10 10S7 17 7 22M17 2c0 5-10 5-10 10s10 5 10 10"/></svg>`;
const MOON_ICON = `<svg class="warn-icon" viewBox="0 0 24 24" style="color:${RED}" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`;

function openWarn(kind, over = 0) {
  const chips = extendChips([15, 30, 60]);
  if (kind === '15') {
    openSheet(`<div class="title-row">${WARN_ICON(YELLOW)}<h3>Лишилось 15 хв</h3></div>
      <p>Встигаєш закінчити?</p>
      <button class="btn-pearl" data-action="close">Встигаю</button>${chips}`);
  } else if (kind === 'end') {
    openSheet(`<div class="title-row">${WARN_ICON(GREEN)}<h3>Час вийшов</h3></div>
      <p>Закінчуєш чи додаємо час?</p>
      <button class="btn-pearl" data-action="done">Готово</button>${chips}`);
  } else {
    openSheet(`<div class="title-row">${WARN_ICON(RED)}<h3>Ти ще на задачі?</h3></div>
      <p>Понад план уже ${dur(over / 60000)}.</p>
      <button class="btn-pearl" data-action="done">Готово</button>${chips}
      <button class="btn-quiet lg" data-action="close">Так, працюю</button>`);
  }
}

// Якщо після зсуву задача виходить за межу дня — пропонуємо перенести.
// Навчання намагаємось зберегти хоча б на 30 хв сьогодні.
function checkLate() {
  const { dayEnd } = state.settings;
  const late = schedule().find((b) => isFlex(b.t) && b.t.status === 'todo' && b.end > dayEnd && !b.t.lateAck);
  if (!late) return;
  const t = late.t, fit = Math.floor(dayEnd - late.start);
  const learn = t.type === 'learn' && t.minutes > 30 && fit >= 30;
  openSheet(`<div class="title-row">${MOON_ICON}<h3>Вже пізно</h3></div>
    <p>«${esc(t.title)}» закінчиться о ${hhmm(late.end)}. Твоя межа дня ${hhmm(dayEnd)}.</p>
    ${learn ? `<p>Навчання краще не пропускати зовсім — хоча б 30 хв сьогодні.</p>
      <button class="btn-pearl" data-action="late-cut" data-id="${t.id}" data-min="30">Хоча б 30 хв сьогодні</button>
      <div class="chips"><button class="btn-quiet lg" data-action="late-move" data-id="${t.id}">На завтра</button>
      <button class="btn-quiet lg" data-action="late-keep" data-id="${t.id}">Повністю</button></div>`
    : `<button class="btn-pearl" data-action="late-move" data-id="${t.id}">Перенести на завтра</button>
      <div class="chips"><button class="btn-quiet lg" data-action="late-keep" data-id="${t.id}">Допрацюю</button>
      <button class="btn-quiet lg" data-action="late-cut" data-id="${t.id}" data-min="${fit}">Скоротити</button></div>`}`);
}

// Довга пауза: одне м'яке нагадування через 30 хв
function checkPauseNag(act) {
  if (sheetOpen() || act.pauseNagged || Date.now() - act.pausedAt < 30 * 60000) return;
  act.pauseNagged = true;
  save();
  beep();
  openSheet(`<div class="title-row">${WARN_ICON(YELLOW)}<h3>Ти на паузі вже 30 хв</h3></div>
    <p>«${esc(act.title)}» чекає. Повертаємось?</p>
    <button class="btn-pearl" data-action="resume">Продовжити задачу</button>
    <div class="chips"><button class="btn-quiet lg" data-action="close">Ще на паузі</button>
    <button class="btn-quiet lg" data-action="done">Задачу завершено</button></div>`);
}

function openPauseReason() {
  const t = active();
  if (!t) return;
  openSheet(`<h3>Що трапилось?</h3>
    <p>«${esc(t.title)}» на паузі — цей час у задачу не рахується. Коли повернешся, натисни «Продовжити задачу». Причина піде у звіт для Скелі, щоб було видно, що тебе перериває.</p>
    <div class="wrap">${PAUSE_REASONS.map((r) => `<button class="btn-quiet${t.pauseReason === r ? ' on' : ''}" data-action="set-reason" data-reason="${r}">${r}</button>`).join('')}</div>
    <button class="btn-quiet lg" data-action="close">Пропустити</button>`);
}

// Кінець робочого дня: питаємо про вечірню роботу, якщо лишились робочі задачі
function checkWorkEnd() {
  if (sheetOpen() || state.flags.workEndAsked || !isWorkday() || nowMin() < state.settings.workEnd) return;
  const left = state.tasks.filter((t) => t.type === 'work' && t.status === 'todo');
  if (!left.length) return;
  state.flags.workEndAsked = true;
  save();
  beep();
  const total = left.reduce((s, t) => s + t.minutes, 0);
  openSheet(`<div class="title-row">${WARN_ICON(YELLOW)}<h3>Робочий час закінчився</h3></div>
    <p>Лишилось робочих задач: ${left.length} (${dur(total)}).</p>
    <button class="btn-pearl" data-action="close">Попрацюю ввечері</button>
    <button class="btn-quiet lg" data-action="work-move">Перенести на завтра</button>`);
}

/* ================= Нижній лист ================= */

const sheetOpen = () => !els.overlay.hidden;
function openSheet(html) {
  els.sheet.innerHTML = html;
  els.overlay.hidden = false;
  els.sheet.scrollTop = 0;
}
function closeSheet() {
  els.overlay.hidden = true;
  els.sheet.innerHTML = '';
}
els.overlay.addEventListener('click', (e) => { if (e.target === els.overlay) closeSheet(); });

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('on'), 1800);
}

// Кнопки-вибору всередині форм: [data-group] — один варіант, [data-multi] — кілька
function bindChoices(form, pick, onChange) {
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-val]');
    if (!b) return;
    const box = b.parentElement;
    if (box.dataset.multi) {
      const v = Number(b.dataset.val);
      const set = pick[box.dataset.multi];
      if (set.has(v)) set.delete(v); else set.add(v);
      b.classList.toggle('on', set.has(v));
    } else {
      box.querySelectorAll('.btn-quiet').forEach((x) => x.classList.toggle('on', x === b));
      const g = box.dataset.group;
      pick[g] = /^\d+$/.test(b.dataset.val) ? Number(b.dataset.val) : b.dataset.val;
    }
    if (onChange) onChange();
  });
}

const choice = (group, opts, cur) => `<div class="wrap" data-group="${group}">${opts.map(([v, n]) =>
  `<button type="button" class="btn-quiet${String(cur) === String(v) ? ' on' : ''}" data-val="${v}">${n}</button>`).join('')}</div>`;
const challengeChoice = (cur) => `<div class="wrap" data-group="challenge">${Object.entries(CHALLENGES).map(([k, c]) =>
  `<button type="button" class="btn-quiet${cur === k ? ' on' : ''}" data-val="${k}"><span class="dot" style="background:${c.color}"></span>${c.name}</button>`).join('')}</div>`;

/* ---------- Меню кнопки «+» ---------- */

function openMenu() {
  const item = (action, title, sub, icon) => `<button class="menu-item" data-action="${action}">
    <span class="menu-ic">${icon}</span><span><b>${title}</b><small>${sub}</small></span></button>`;
  openSheet(`<div class="menu">
    ${item('add', 'Нова задача', 'Додати вручну', PLUS_SVG)}
    ${item('import', 'Вставити план з Claude', 'Скеля сама розкладе задачі по днях', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="4" rx="1"/><path d="M9 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-3M9 13h6M9 17h4"/></svg>')}
    ${item('report', 'Звіт для Скелі', 'Підсумок дня, щоб обговорити в Claude', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V12M12 20V5M19 20v-6"/></svg>')}
    ${item('routine', 'Мій розклад', 'English, тренування, їжа — що повторюється щотижня', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>')}
  </div>`);
}

/* ---------- Форма задачі: нова, редагування, вільне вікно ---------- */

function rearm(t) {
  const rem = plan(t) * 60000 - elapsedMs(t);
  if (rem > 15 * 60000) t.warned15 = false;
  if (rem > 0) { t.warnedEnd = false; t.lastNag = 0; }
}

function openForm({ task = null, gap = null, preset = null, dayKey = null } = {}) {
  const editing = !!task;
  const today = todayKey(), tomorrow = addDays(today, 1);
  // З якого дня задача: для редагування — де вона лежить, для нової — обраний день або сьогодні
  const srcKey = editing ? (findTask(task.id) || { key: today }).key : (dayKey || today);
  const RANGE_MAX = 480;
  const pick = {
    type: task ? task.type : (preset && preset.type) || 'work',
    when: (task && task.startAt != null) || gap ? 'at' : 'auto',
    challenge: (task && task.challenge) || 'ux',
    // У вільне вікно: стільки, скільки вміщається, але не більше години (кратно 5 хв)
    minutes: task ? task.minutes : gap ? Math.max(5, Math.min(60, Math.floor(gap.len / 5) * 5)) : (preset && preset.minutes) || 60,
    day: srcKey === 'backlog' ? 'none' : srcKey === today ? 'today' : srcKey === tomorrow ? 'tomorrow' : 'date',
  };
  const canMove = !editing || task.status === 'todo';
  const lockType = editing && task.status !== 'todo';
  const soon = Math.ceil(nowMin() / 15) * 15;
  const at = hhmm(task && task.fixedStart != null ? task.fixedStart : gap ? gap.start : soon);
  const startAt = hhmm(task && task.startAt != null ? task.startAt : gap ? gap.start : soon);

  let facts = '';
  if (editing && task.status === 'done') facts = `<p>Зроблено за ${dur(elapsedMs(task) / 60000)} · план ${dur(plan(task))}</p>`;
  if (editing && task.status === 'active') facts = `<p>Зараз у роботі · план ${dur(plan(task))}${task.extra ? ` (+${task.extra} хв)` : ''}</p>`;
  if (gap) facts = `<p>Вільне вікно ${hhmm(gap.start)}–${hhmm(gap.start + gap.len)} · ${dur(gap.len)}</p>`;
  const canStart = editing && srcKey === today && isFlex(task) && task.status === 'todo' && !active();

  openSheet(`<form id="taskForm" class="form" novalidate>
    <h3>${editing ? 'Задача' : 'Нова задача'}</h3>${facts}
    <label class="field"><span>Що робиш</span><input class="input" name="title" autocomplete="off" placeholder="Макет головної для клієнта" value="${esc(task ? task.title : '')}"></label>
    <label class="field" data-show="flex"><span>Що буде результатом</span><input class="input" name="result" autocomplete="off" placeholder="Перший екран + меню, готові на рев'ю" value="${esc(task ? task.result : '')}"></label>
    <div class="field"${canMove ? '' : ' hidden'}><span>День</span>
      ${choice('day', [['today', 'Сьогодні'], ['tomorrow', 'Завтра'], ['date', 'Інший день'], ['none', 'Без дати']], pick.day)}</div>
    <label class="field" data-show="day-date" hidden><span>Дата</span><input class="input" type="date" name="dayDate" min="${today}" value="${srcKey !== 'backlog' && srcKey > tomorrow ? srcKey : addDays(today, 2)}"></label>
    <div class="field"${lockType ? ' hidden' : ''}><span>Тип</span>
      ${choice('type', [['work', 'Робота'], ['learn', 'Навчання'], ['fixed', 'Фіксована'], ['break', 'Перерва']], pick.type)}</div>
    <div class="field" data-show="learn" hidden><span>Челендж</span>${challengeChoice(pick.challenge)}</div>
    <label class="field" data-show="time" hidden><span>О котрій</span><input class="input" type="time" name="at" value="${at}"></label>
    <div class="field"><span>Скільки часу даєш</span>
      <div class="dur-box">
        <div class="dur-inputs">
          <label class="dur-num"><input class="input" type="number" inputmode="numeric" name="durH" min="0" max="12" value="${Math.floor(pick.minutes / 60)}" aria-label="Години"><span>год</span></label>
          <label class="dur-num"><input class="input" type="number" inputmode="numeric" name="durM" min="0" max="59" value="${pick.minutes % 60}" aria-label="Хвилини"><span>хв</span></label>
        </div>
        <input class="range" type="range" name="durR" min="5" max="${RANGE_MAX}" step="5" value="${Math.min(pick.minutes, RANGE_MAX)}" aria-label="Тривалість">
        <div class="range-scale"><span>5 хв</span><span>2 год</span><span>4 год</span><span>6 год</span><span>8 год</span></div>
      </div></div>
    <p class="hint" id="splitHint" hidden>Більше 2 год? Розбий на кроки.</p>
    <div class="field" data-show="when"><span>Коли почати</span>
      ${choice('when', [['auto', 'Після попередньої'], ['at', 'О певній годині']], pick.when)}</div>
    <label class="field" data-show="when-at" hidden><span>Початок</span><input class="input" type="time" name="startAt" value="${startAt}"></label>
    <p class="err" id="formErr"></p>
    <button class="btn-pearl" type="submit">${editing ? 'Зберегти' : 'Додати в план'}</button>
    ${editing ? `<div class="chips">
      ${canStart ? `<button type="button" class="btn-quiet lg" data-action="start" data-id="${task.id}">Почати зараз</button>` : ''}
      ${task.status !== 'active' ? `<button type="button" class="btn-quiet lg" data-action="delete" data-id="${task.id}">Видалити</button>` : ''}</div>` : ''}
  </form>`);

  const form = $('#taskForm');
  const flexible = () => pick.type === 'work' || pick.type === 'learn';
  const sync = () => {
    form.querySelectorAll('[data-show="flex"]').forEach((x) => { x.hidden = !flexible(); });
    form.querySelector('[data-show="learn"]').hidden = pick.type !== 'learn';
    form.querySelector('[data-show="time"]').hidden = flexible();
    // Без дати час старту не має сенсу
    form.querySelector('[data-show="when"]').hidden = !flexible() || pick.day === 'none';
    form.querySelector('[data-show="when-at"]').hidden = !(flexible() && pick.when === 'at' && pick.day !== 'none');
    form.querySelector('[data-show="day-date"]').hidden = pick.day !== 'date';
    $('#splitHint').hidden = !(pick.minutes > 120 && flexible());
  };
  bindChoices(form, pick, sync);
  form.addEventListener('input', () => { $('#formErr').textContent = ''; });

  // Повзунок і поля год/хв показують одне й те саме значення
  const { durH, durM, durR } = form.elements;
  const paintRange = () => { durR.style.setProperty('--p', `${((durR.value - durR.min) / (durR.max - durR.min)) * 100}%`); };
  durR.addEventListener('input', () => {
    pick.minutes = Number(durR.value);
    durH.value = Math.floor(pick.minutes / 60);
    durM.value = pick.minutes % 60;
    paintRange(); sync();
  });
  const fromFields = () => {
    pick.minutes = Math.max(0, Math.round(Number(durH.value) || 0)) * 60 + Math.max(0, Math.round(Number(durM.value) || 0));
    durR.value = Math.min(Math.max(pick.minutes, 5), RANGE_MAX);
    paintRange(); sync();
  };
  durH.addEventListener('input', fromFields);
  durM.addEventListener('input', fromFields);
  // Хвилини понад 59 перетворюємо на години, коли поле втрачає фокус
  durM.addEventListener('change', () => { durH.value = Math.floor(pick.minutes / 60); durM.value = pick.minutes % 60; });
  paintRange();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = form.elements.title.value.trim(), result = form.elements.result.value.trim();
    if (!title) { $('#formErr').textContent = 'Напиши, що робиш.'; return; }
    if (flexible() && !result) { $('#formErr').textContent = 'Напиши, що буде результатом — так ти знатимеш, коли задача готова.'; return; }
    if (pick.minutes < 5 || pick.minutes > 12 * 60) { $('#formErr').textContent = 'Вкажи тривалість від 5 хв до 12 год.'; return; }
    const target = pick.day === 'today' ? today : pick.day === 'tomorrow' ? tomorrow : pick.day === 'none' ? 'backlog' : form.elements.dayDate.value;
    if (!target) { $('#formErr').textContent = 'Обери дату.'; return; }
    if (target !== 'backlog' && target < today) { $('#formErr').textContent = 'Ця дата вже минула.'; return; }
    if (target === 'backlog' && !flexible()) { $('#formErr').textContent = 'Фіксовану подію чи перерву треба прив\'язати до дня.'; return; }

    const t = task || { id: uid(), status: 'todo', extra: 0 };
    Object.assign(t, { title, type: pick.type, minutes: pick.minutes, lateAck: false });
    if (flexible()) {
      t.result = result;
      delete t.fixedStart;
      if (pick.when === 'at') t.startAt = parseHHMM(form.elements.startAt.value || hhmm(soon)); else delete t.startAt;
    } else {
      t.fixedStart = parseHHMM(form.elements.at.value || '12:00');
      delete t.startAt;
    }
    if (pick.type === 'learn' || (pick.type === 'fixed' && task && task.challenge)) t.challenge = pick.challenge; else if (pick.type !== 'fixed') delete t.challenge;
    if (target === 'backlog') delete t.startAt;
    if (t.status === 'active') rearm(t);

    if (!task) listFor(target).push(t);
    else if (target !== srcKey) {
      // Перенесення на інший день або в «Без дати»
      const src = listFor(srcKey);
      src.splice(src.indexOf(task), 1);
      listFor(target).push(resetTask(t));
      toast(target === 'backlog' ? 'Перенесено в «Без дати»' : `Перенесено на ${dayLabel(target)}`);
    }
    save();
    closeSheet();
    renderAll();
    if (target === today) checkLate();
  });
  sync();
  if (!editing) setTimeout(() => form.elements.title.focus(), 250);
}

function openTask(id) {
  if (id.startsWith('r:')) { openRoutineForm(id.slice(2)); return; }
  const f = findTask(id);
  if (f) openForm({ task: f.task });
}

/* ---------- Мій день і мій розклад ---------- */

function openSettings() {
  const s = state.settings;
  const pick = { days: new Set(s.workDays) };
  openSheet(`<form id="setForm" class="form">
    <h3>Мій день</h3>
    <div class="row2">
      <label class="field"><span>Початок роботи</span><input class="input" type="time" name="s" value="${hhmm(s.dayStart)}"></label>
      <label class="field"><span>Кінець роботи</span><input class="input" type="time" name="w" value="${hhmm(s.workEnd)}"></label>
    </div>
    <label class="field"><span>Межа дня — після неї Скеля пропонує переносити</span><input class="input" type="time" name="e" value="${hhmm(s.dayEnd)}"></label>
    <div class="field"><span>Робочі дні</span><div class="wrap" data-multi="days">
      ${WEEKDAYS.map(([d, n]) => `<button type="button" class="btn-quiet${pick.days.has(d) ? ' on' : ''}" data-val="${d}">${n}</button>`).join('')}</div></div>
    <p class="err" id="setErr"></p>
    <button class="btn-pearl" type="submit">Зберегти</button>
    <button type="button" class="btn-quiet lg" data-action="routine">Мій розклад тижня</button></form>`);
  const f = $('#setForm');
  bindChoices(f, pick);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const st = parseHHMM(f.elements.s.value || '10:00');
    const we = parseHHMM(f.elements.w.value || '17:00');
    const en = parseHHMM(f.elements.e.value || '21:00');
    if (we <= st) { $('#setErr').textContent = 'Кінець роботи має бути пізніше за початок.'; return; }
    if (en < we) { $('#setErr').textContent = 'Межа дня не може бути раніше за кінець роботи.'; return; }
    Object.assign(state.settings, { dayStart: st, workEnd: we, dayEnd: en, workDays: [...pick.days] });
    state.tasks.forEach((t) => { t.lateAck = false; });
    save(); closeSheet(); renderAll(); checkLate();
  });
}

const daysText = (days) => {
  const set = new Set(days);
  if (set.size === 7) return 'щодня';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Пн–Пт';
  return WEEKDAYS.filter(([d]) => set.has(d)).map(([, n]) => n).join(', ');
};

function openRoutine() {
  const rows = [...state.routine].sort((a, b) => a.at - b.at).map((r) => {
    const c = taskColor(r);
    return `<button class="routine-row" data-action="routine-edit" data-id="${r.id}">
      <span class="rt">${hhmm(r.at)}</span>
      <span class="rn">${c ? `<span class="dot" style="background:${c}"></span>` : ''}${esc(r.title)}${r.type === 'fixed' ? LOCK_SVG : ''}
        <small>${daysText(r.days)} · ${dur(r.minutes)}${r.type === 'break' ? ' · перерва' : ''}</small></span></button>`;
  }).join('');
  openSheet(`<h3>Мій розклад тижня</h3>
    <p>Повторюється щотижня і сам з'являється в плані потрібного дня.</p>
    <div class="routine">${rows || '<p class="empty">Поки нічого немає.</p>'}</div>
    <button class="btn-pearl" data-action="routine-edit">Додати в розклад</button>`);
}

function openRoutineForm(id) {
  const r = state.routine.find((x) => x.id === id) || null;
  const mins = [15, 30, 45, 50, 60, 75, 90, 120];
  const pick = {
    type: r ? r.type : 'fixed',
    challenge: (r && r.challenge) || 'none',
    minutes: r ? r.minutes : 60,
    days: new Set(r ? r.days : [1]),
  };
  if (!mins.includes(pick.minutes)) { mins.push(pick.minutes); mins.sort((a, b) => a - b); }
  openSheet(`<form id="rForm" class="form" novalidate>
    <h3>${r ? 'Подія в розкладі' : 'Нова подія в розкладі'}</h3>
    <label class="field"><span>Назва</span><input class="input" name="title" autocomplete="off" placeholder="English" value="${esc(r ? r.title : '')}"></label>
    <div class="field"><span>Дні</span><div class="wrap" data-multi="days">
      ${WEEKDAYS.map(([d, n]) => `<button type="button" class="btn-quiet${pick.days.has(d) ? ' on' : ''}" data-val="${d}">${n}</button>`).join('')}</div></div>
    <label class="field"><span>О котрій</span><input class="input" type="time" name="at" value="${hhmm(r ? r.at : 9 * 60)}"></label>
    <div class="field"><span>Скільки триває</span>${choice('minutes', mins.map((m) => [m, dur(m)]), pick.minutes)}</div>
    <div class="field"><span>Тип</span>${choice('type', [['fixed', 'Фіксована'], ['break', 'Перерва']], pick.type)}</div>
    <div class="field"><span>Челендж (якщо це навчання)</span>
      <div class="wrap" data-group="challenge"><button type="button" class="btn-quiet${pick.challenge === 'none' ? ' on' : ''}" data-val="none">Немає</button>
      ${Object.entries(CHALLENGES).map(([k, c]) => `<button type="button" class="btn-quiet${pick.challenge === k ? ' on' : ''}" data-val="${k}"><span class="dot" style="background:${c.color}"></span>${c.name}</button>`).join('')}</div></div>
    <p class="err" id="rErr"></p>
    <button class="btn-pearl" type="submit">Зберегти</button>
    <div class="chips">${r ? `<button type="button" class="btn-quiet lg" data-action="routine-delete" data-id="${r.id}">Видалити</button>` : ''}
      <button type="button" class="btn-quiet lg" data-action="routine">Назад</button></div>
  </form>`);
  const f = $('#rForm');
  bindChoices(f, pick);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = f.elements.title.value.trim();
    if (!title) { $('#rErr').textContent = 'Напиши назву.'; return; }
    if (!pick.days.size) { $('#rErr').textContent = 'Обери хоча б один день.'; return; }
    const item = r || { id: uid() };
    Object.assign(item, { title, days: [...pick.days], at: parseHHMM(f.elements.at.value || '09:00'), minutes: pick.minutes, type: pick.type });
    if (pick.challenge !== 'none') item.challenge = pick.challenge; else delete item.challenge;
    if (!r) state.routine.push(item);
    save(); renderAll(); openRoutine();
  });
}

function openCustom() {
  openSheet(`<form id="cForm" class="form">
    <h3>Скільки ще треба?</h3>
    <label class="field"><span>Хвилин</span><input class="input" type="number" inputmode="numeric" name="m" min="1" max="600" placeholder="40"></label>
    <p class="err" id="cErr"></p>
    <button class="btn-pearl" type="submit">Додати час</button></form>`);
  const f = $('#cForm');
  setTimeout(() => f.elements.m.focus(), 250);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const m = Math.round(Number(f.elements.m.value));
    if (!m || m < 1 || m > 600) { $('#cErr').textContent = 'Введи від 1 до 600 хвилин.'; return; }
    closeSheet();
    extend(m);
  });
}

/* ================= План з Claude ================= */

// Розбирає текст плану. Формат описано в 02-skelya-coach-prompt.md:
//   📅 2026-10-24              — день (також 24.10, «сьогодні», «завтра»)
//   - 60 | Назва | Результат   — робота
//   - UX 60 | Назва | Результат — навчання з челенджем
//   - 16:00 30 | Дзвінок       — фіксована подія
//   - перерва 15:00 20 | Кава  — перерва
const DAY_TOKENS = { пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6, нд: 0 };
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Рядок розкладу: 🔁 [мітка] Дні ГГ:ХХ хвилини | Назва
//   🔁 English Пн,Чт 16:45 75 | English
//   🔁 перерва Пн-Пт 13:00 60 | Обід
function parseRoutineLine(line, challengeKey) {
  const [headRaw, title] = line.replace(/^🔁\s*/u, '').split('|').map((x) => (x || '').trim());
  if (!title) return null;
  let head = headRaw;
  const tm = head.match(/(\d{1,2}):(\d{2})/);
  if (!tm) return null;
  const at = Number(tm[1]) * 60 + Number(tm[2]);
  head = head.replace(tm[0], ' ');

  const days = new Set();
  if (/щодня/i.test(head)) DAY_ORDER.forEach((d) => days.add(d));
  head = head.replace(/(?<!\p{L})(пн|вт|ср|чт|пт|сб|нд)\s*[-–]\s*(пн|вт|ср|чт|пт|сб|нд)(?!\p{L})/giu, (m, a, b) => {
    const i = DAY_ORDER.indexOf(DAY_TOKENS[a.toLowerCase()]), j = DAY_ORDER.indexOf(DAY_TOKENS[b.toLowerCase()]);
    for (let k = i; k <= j; k++) days.add(DAY_ORDER[k]);
    return ' ';
  });
  head = head.replace(/(?<!\p{L})(пн|вт|ср|чт|пт|сб|нд)(?!\p{L})/giu, (m) => { days.add(DAY_TOKENS[m.toLowerCase()]); return ' '; });
  if (!days.size) return null;

  const n = head.match(/\d+/);
  const minutes = n ? Number(n[0]) : 60;
  const word = head.replace(/[^\p{L}]+/gu, ' ').trim().split(/\s+/)[0] || '';
  const ch = word ? challengeKey(word) : null;
  const item = { id: uid(), title, days: [...days], at, minutes, type: /^перерв|^break/i.test(word) ? 'break' : 'fixed' };
  if (ch) item.challenge = ch;
  return item;
}

function parsePlan(text) {
  const today = todayKey();
  const days = {};
  const routine = [];
  const skipped = [];
  let cur = today;
  const challengeKey = (word) => {
    const w = word.toLowerCase();
    const alias = { english: 'en', англ: 'en', англійська: 'en', укр: 'ua', українська: 'ua', маркетинг: 'mk', насмотреність: 'vs', насмотренность: 'vs' };
    if (alias[w]) return alias[w];
    return Object.keys(CHALLENGES).find((k) => CHALLENGES[k].name.toLowerCase() === w) || null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^\*\*|\*\*$/g, '');
    if (!line) continue;

    if (/^🔁/u.test(line)) {
      const r = parseRoutineLine(line, challengeKey);
      if (r) routine.push(r); else skipped.push(line);
      continue;
    }

    if (!line.includes('|')) {
      const iso = line.match(/(\d{4})-(\d{2})-(\d{2})/);
      const dm = line.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);
      if (iso) cur = `${iso[1]}-${iso[2]}-${iso[3]}`;
      else if (dm) {
        let y = dm[3] ? Number(dm[3]) : new Date().getFullYear();
        if (y < 100) y += 2000;
        cur = `${y}-${pad(dm[2])}-${pad(dm[1])}`;
      } else if (/без\s+дати/i.test(line)) cur = 'backlog';
      else if (/сьогодні/i.test(line)) cur = today;
      else if (/завтра/i.test(line)) cur = addDays(today, 1);
      continue;
    }

    const parts = line.replace(/^[-•*–]\s*/, '').split('|').map((x) => x.trim());
    let head = parts[0];
    let title = parts[1];
    let result = parts[2] || '';
    if (!title) { skipped.push(line); continue; }
    // Без хвилин і мітки: «- Назва | Результат»
    const firstWord = (head.match(/^\p{L}+/u) || [''])[0];
    if (!/\d/.test(head) && !challengeKey(firstWord) && !/^перерв|^break/i.test(firstWord)) {
      result = title; title = head; head = '';
    }

    let at = null;
    const tm = head.match(/(\d{1,2}):(\d{2})/);
    if (tm) { at = Number(tm[1]) * 60 + Number(tm[2]); head = head.replace(tm[0], ' '); }

    let minutes = 0;
    // \b не працює з кирилицею, тому межу слова перевіряємо через (?!\p{L})
    const hm = head.match(/(\d+(?:[.,]\d+)?)\s*(?:год\p{L}*|г|h)(?!\p{L})/iu);
    const mm = head.match(/(\d+)\s*(?:хв\p{L}*|m|min)(?!\p{L})/iu);
    if (hm) { minutes += Math.round(parseFloat(hm[1].replace(',', '.')) * 60); head = head.replace(hm[0], ' '); }
    if (mm) { minutes += Number(mm[1]); head = head.replace(mm[0], ' '); }
    if (!minutes) {
      const n = head.match(/\b(\d+)\b/);
      if (n) { minutes = Number(n[1]); head = head.replace(n[0], ' '); }
    }
    if (!minutes) minutes = 60;

    const word = head.replace(/[^\p{L}]+/gu, ' ').trim().split(/\s+/)[0] || '';
    const ch = word ? challengeKey(word) : null;
    let type = 'work';
    if (/^перерв|^break|^відпоч/i.test(word)) type = 'break';
    else if (ch) type = at != null ? 'fixed' : 'learn';
    else if (at != null) type = 'fixed';
    if (type === 'break' && at == null) { skipped.push(line); continue; }

    const t = { id: uid(), title, type, minutes, status: 'todo', extra: 0 };
    if (isFlex(t)) t.result = result || 'Зроблено';
    if (at != null) t.fixedStart = at;
    if (ch) t.challenge = ch;
    (days[cur] = days[cur] || []).push(t);
  }

  for (const k of Object.keys(days)) if (k < today) { skipped.push(`${k}: дата вже минула`); delete days[k]; }
  return { days, routine, skipped };
}

const overlaps = (a, b) => a.fixedStart < b.fixedStart + b.minutes && b.fixedStart < a.fixedStart + a.minutes;
const sameTitle = (a, b) => a.title.trim().toLowerCase() === b.title.trim().toLowerCase();

// Шукає, що нове накладається на вже наявне: зустрічі в один час або та сама задача двічі
function findConflicts(days) {
  const conflicts = [];
  for (const [key, list] of Object.entries(days)) {
    const existing = listFor(key);
    const routine = key === 'backlog' ? [] : routineFor(key);
    days[key] = list.filter((t) => {
      if (!isFlex(t) && routine.some((r) => sameTitle(r, t) && r.fixedStart === t.fixedStart)) return false; // вже є в розкладі
      let other = null, kind = '';
      if (!isFlex(t)) {
        other = existing.find((x) => !isFlex(x) && overlaps(x, t)) || routine.find((x) => overlaps(x, t));
        kind = 'time';
      }
      if (!other) { other = existing.find((x) => x.status !== 'done' && sameTitle(x, t)); kind = 'dup'; }
      if (other) conflicts.push({ key, t, other, kind });
      return true;
    });
  }
  return conflicts;
}

function openImport() {
  openSheet(`<form id="impForm" class="form">
    <h3>Вставити план з Claude</h3>
    <p>Скопіюй план, який склала Скеля в Claude, і встав сюди. Задачі розкладуться по днях.</p>
    <textarea class="input area" name="text" placeholder="📅 ${addDays(todayKey(), 1)}&#10;- 60 | Макет головної | Перший екран готовий&#10;- UX 60 | Кейс-стаді | 3 інсайти"></textarea>
    <p class="err" id="impErr"></p>
    <button class="btn-pearl" type="submit">Розібрати план</button>
    ${navigator.clipboard && navigator.clipboard.readText ? '<button type="button" class="btn-quiet lg" id="pasteBtn">Вставити з буфера</button>' : ''}
  </form>`);
  const f = $('#impForm');
  const pb = $('#pasteBtn');
  if (pb) pb.addEventListener('click', async () => {
    try { f.elements.text.value = await navigator.clipboard.readText(); } catch (e) { $('#impErr').textContent = 'Не вдалося прочитати буфер. Встав текст вручну.'; }
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const { days, routine, skipped } = parsePlan(f.elements.text.value);
    if (!Object.keys(days).length && !routine.length) {
      $('#impErr').textContent = 'Не знайшла жодної задачі. Перевір, що рядки мають вигляд «- 60 | Назва | Результат».';
      return;
    }
    openImportReview(days, skipped, routine);
  });
}

function openImportReview(days, skipped, routine = []) {
  // Розклад, якого ще немає (та сама назва і час вважаються дублем)
  const newRoutine = routine.filter((r) => !state.routine.some((x) => sameTitle(x, r) && x.at === r.at));
  const routineHtml = routine.length ? `<div class="imp-day"><b>Розклад тижня</b>
    ${routine.map((r) => `<div class="imp-row${newRoutine.includes(r) ? '' : ' muted'}">${taskColor(r) ? `<span class="dot" style="background:${taskColor(r)}"></span>` : ''}${daysText(r.days)} · ${hhmm(r.at)} · ${esc(r.title)} <span class="muted">· ${dur(r.minutes)}${newRoutine.includes(r) ? '' : ' · вже є'}</span></div>`).join('')}</div>` : '';
  const conflicts = findConflicts(days);
  const summary = Object.entries(days).sort().map(([k, list]) => `<div class="imp-day"><b>${dayLabel(k)}</b>
    ${list.map((t) => `<div class="imp-row">${taskColor(t) ? `<span class="dot" style="background:${taskColor(t)}"></span>` : ''}${t.fixedStart != null ? `${hhmm(t.fixedStart)} · ` : ''}${esc(t.title)} <span class="muted">· ${dur(t.minutes)}</span></div>`).join('')}</div>`).join('');
  const conf = conflicts.map((c, i) => {
    const text = c.kind === 'time'
      ? `«${esc(c.t.title)}» о ${hhmm(c.t.fixedStart)} накладається на «${esc(c.other.title)}» о ${hhmm(c.other.fixedStart)}`
      : `«${esc(c.t.title)}» вже є в плані`;
    const opts = [['new', c.kind === 'dup' ? 'Додати ще раз' : 'Додати обидві'], ['skip', 'Не додавати']];
    if (!c.other.virtual && c.other.status !== 'active') opts.push(['replace', 'Замінити стару']);
    return `<div class="conf" data-i="${i}"><p>${dayLabel(c.key)}: ${text}. Що важливіше?</p>
      <div class="wrap" data-group="c${i}">${opts.map(([v, n]) => `<button type="button" class="btn-quiet" data-val="${v}">${n}</button>`).join('')}</div></div>`;
  }).join('');

  openSheet(`<form id="revForm" class="form">
    <h3>Перевір план</h3>
    ${routineHtml}
    ${summary}
    ${conflicts.length ? `<h4>Потрібне твоє рішення</h4>${conf}` : ''}
    ${skipped.length ? `<p class="muted">Не вдалося прочитати: ${skipped.map(esc).join('; ')}</p>` : ''}
    <p class="err" id="revErr"></p>
    <button class="btn-pearl" type="submit">Додати в план</button>
    <button type="button" class="btn-quiet lg" data-action="import">Назад</button></form>`);
  const f = $('#revForm');
  const pick = {};
  bindChoices(f, pick, () => { $('#revErr').textContent = ''; });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const missing = conflicts.findIndex((c, i) => !pick[`c${i}`]);
    if (missing >= 0) { $('#revErr').textContent = 'Обери, що робити з кожним конфліктом.'; return; }
    conflicts.forEach((c, i) => {
      const how = pick[`c${i}`];
      if (how === 'skip') days[c.key] = days[c.key].filter((t) => t !== c.t);
      if (how === 'replace') {
        const list = listFor(c.key);
        list.splice(list.indexOf(c.other), 1);
      }
    });
    let n = 0;
    for (const [k, list] of Object.entries(days)) { listFor(k).push(...list); n += list.length; }
    state.routine.push(...newRoutine);
    save(); closeSheet(); renderAll(); checkLate();
    toast(newRoutine.length ? `Додано задач: ${n}, у розклад: ${newRoutine.length}` : `Додано задач: ${n}`);
  });
}

/* ================= Звіт для Скелі ================= */

function buildReport() {
  const lines = [`Звіт за ${dayLabel(todayKey())}`, ''];
  const done = state.tasks.filter((t) => isFlex(t) && t.status === 'done');
  const act = active();
  const left = state.tasks.filter((t) => isFlex(t) && t.status === 'todo');
  const fact = (t) => elapsedMs(t) / 60000;

  lines.push('Зроблено:');
  if (!done.length) lines.push('— нічого');
  for (const t of done) {
    const tag = t.type === 'learn' ? ` [${CHALLENGES[t.challenge]?.name || 'навчання'}]` : '';
    lines.push(`- ${t.title}${tag}: план ${dur(t.minutes)}, факт ${dur(fact(t))}${t.extra ? ` (додавала +${t.extra} хв)` : ''}`);
  }
  if (act) lines.push('', `У процесі: ${act.title} — вже ${dur(elapsedMs(act) / 60000)} з ${dur(plan(act))}${act.pausedAt ? ' (зараз на паузі)' : ''}`);

  // Що переривало роботу
  const breaks = [];
  for (const t of [...done, ...(act ? [act] : [])]) {
    for (const p of t.pauses || []) if (p.reason !== 'Перевірка') breaks.push({ t, reason: p.reason, min: (p.end - p.start) / 60000 });
    if (t.pausedAt) breaks.push({ t, reason: t.pauseReason, min: (Date.now() - t.pausedAt) / 60000 });
  }
  if (breaks.length) {
    const total = breaks.reduce((s, b) => s + b.min, 0);
    lines.push('', `Перериви: ${breaks.length}, разом ${dur(total)}`);
    breaks.forEach((b) => lines.push(`- ${b.reason || 'без причини'} — ${dur(b.min)} (під час «${b.t.title}»)`));
  }
  if (left.length) { lines.push('', 'Не встигла:'); left.forEach((t) => lines.push(`- ${t.title} (${dur(t.minutes)})`)); }
  if (state.flags.moved.length) { lines.push('', 'Перенесла на завтра:'); state.flags.moved.forEach((x) => lines.push(`- ${x}`)); }

  const learnMin = done.filter((t) => t.type === 'learn').reduce((s, t) => s + fact(t), 0);
  lines.push('', `Навчання сьогодні: ${learnMin ? dur(learnMin) : 'не було'}`);
  const planned = done.reduce((s, t) => s + t.minutes, 0), real = done.reduce((s, t) => s + fact(t), 0);
  if (done.length) lines.push(`Оцінки: планувала ${dur(planned)}, вийшло ${dur(real)}`);

  const work = done.filter((t) => t.type === 'work');
  if (work.length) {
    lines.push('', 'Час для платформи агенції:');
    work.forEach((t) => {
      const off = pausedMs(t) / 60000;
      lines.push(`- ${t.title} — ${hhmm(minOfDay(t.startedAt))}–${hhmm(minOfDay(t.finishedAt))}, чистий час ${dur(fact(t))}${off >= 1 ? ` (перерви ${dur(off)} не враховано)` : ''}`);
    });
  }
  return lines.join('\n');
}

function openReport() {
  openSheet(`<h3>Звіт для Скелі</h3>
    <p>Скопіюй і встав у Claude — Скеля розбере день і допоможе спланувати завтра.</p>
    <textarea class="input area" id="repText" readonly>${esc(buildReport())}</textarea>
    <button class="btn-pearl" data-action="copy-report">Скопіювати</button>
    <a class="btn-quiet lg" href="https://claude.ai/" target="_blank" rel="noopener">Відкрити Claude</a>`);
}

async function copyReport() {
  const ta = $('#repText');
  try { await navigator.clipboard.writeText(ta.value); toast('Скопійовано'); }
  catch (e) { ta.select(); toast('Виділено — натисни «Копіювати»'); }
}

/* ================= Дії ================= */

function start(id) {
  if (active()) { toast('Спершу заверши поточну задачу'); return; }
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, resetTask(t), { status: 'active', startedAt: Date.now() });
  save();
  closeSheet();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closePause(t) {
  if (!t.pausedAt) return;
  (t.pauses = t.pauses || []).push({ start: t.pausedAt, end: Date.now(), reason: t.pauseReason });
  t.pausedAt = null;
  t.pauseReason = null;
  t.pauseNagged = false;
}

function pause() {
  const t = active();
  if (!t || t.pausedAt) return;
  t.pausedAt = Date.now();
  t.pauseReason = null;
  save();
  renderAll();
  openPauseReason();
}

function resume() {
  const t = active();
  if (!t) return;
  closePause(t);
  rearm(t);
  save();
  closeSheet();
  renderAll();
  checkLate();
}

function done() {
  const t = active();
  if (!t) return;
  closePause(t);
  t.status = 'done';
  t.finishedAt = Date.now();
  save();
  closeSheet();
  renderAll();
  if (t.result) {
    openSheet(`<h3>Перевірка</h3><p>Перш ніж віддати — чи готово?</p>
      <div class="field"><span>Результат</span><div>${esc(t.result)}</div></div>
      <button class="btn-pearl" data-action="close">Так, готово</button>
      <button class="btn-quiet lg" data-action="reopen" data-id="${t.id}">Ні, ще +15 хв</button>`);
  }
}

function extend(m) {
  const t = active();
  if (!t) return;
  t.extra = (t.extra || 0) + m;
  rearm(t);
  save();
  closeSheet();
  renderAll();
  toast(`+${dur(m)} до задачі`);
  checkLate();
}

const byId = (id) => state.tasks.find((x) => x.id === id);

const actions = {
  start: (el) => start(el.dataset.id || nextTask()?.id),
  done,
  extend: (el) => extend(Number(el.dataset.min)),
  custom: openCustom,
  menu: openMenu,
  // На екрані «Задачі» нова задача одразу йде в обраний день
  add: () => openForm({ dayKey: view === 'tasks' && cal.sel >= todayKey() ? cal.sel : undefined }),
  tab: (el) => { view = el.dataset.tab; closeSheet(); window.scrollTo(0, 0); renderAll(); },
  'cal-mode': (el) => { cal.mode = el.dataset.mode; renderTasks(); },
  'cal-pick': (el) => { cal.sel = el.dataset.key; renderTasks(); },
  'cal-today': () => { cal.sel = todayKey(); renderTasks(); },
  'cal-shift': (el) => { cal.sel = addDays(cal.sel, Number(el.dataset.n)); renderTasks(); },
  'cal-month': (el) => {
    const d = dateOf(cal.sel);
    const t = new Date(d.getFullYear(), d.getMonth() + Number(el.dataset.n), 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    cal.sel = keyOf(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
    renderTasks();
  },
  'add-learn': () => openForm({ preset: { type: 'learn', minutes: 60 } }),
  gap: (el) => openForm({ gap: { start: Number(el.dataset.start), len: Number(el.dataset.len) } }),
  open: (el) => openTask(el.dataset.id),
  settings: openSettings,
  routine: openRoutine,
  'routine-edit': (el) => openRoutineForm(el.dataset.id),
  'routine-delete': (el) => {
    state.routine = state.routine.filter((r) => r.id !== el.dataset.id);
    save(); renderAll(); openRoutine();
  },
  import: openImport,
  report: openReport,
  'copy-report': copyReport,
  close: closeSheet,
  soon: () => toast('Цей розділ буде згодом'),
  delete: (el) => {
    removeTask(el.dataset.id);
    save(); closeSheet(); renderAll();
  },
  pause,
  resume,
  'pause-reason': openPauseReason,
  'set-reason': (el) => {
    const t = active();
    if (t && t.pausedAt) t.pauseReason = el.dataset.reason;
    save(); closeSheet(); renderAll();
  },
  reopen: (el) => {
    const t = byId(el.dataset.id);
    if (!t || active()) { closeSheet(); return; }
    // Час між «Готово» і поверненням не рахуємо як роботу
    (t.pauses = t.pauses || []).push({ start: t.finishedAt, end: Date.now(), reason: 'Перевірка' });
    t.status = 'active';
    t.finishedAt = null;
    closeSheet();
    extend(15);
  },
  'late-move': (el) => {
    const t = byId(el.dataset.id);
    if (t) moveToTomorrow(t);
    save(); closeSheet(); renderAll();
    toast('Перенесено на завтра');
    checkLate();
  },
  'late-keep': (el) => {
    const t = byId(el.dataset.id);
    if (t) t.lateAck = true;
    save(); closeSheet(); checkLate();
  },
  'late-cut': (el) => {
    const t = byId(el.dataset.id);
    const fit = Number(el.dataset.min);
    if (t && fit >= 15) { t.minutes = fit; t.lateAck = true; toast(`Тепер ${dur(fit)}`); }
    else if (t) { t.lateAck = true; toast('Скоротити не вийде — менше 15 хв'); }
    save(); closeSheet(); renderAll(); checkLate();
  },
  'work-move': () => {
    state.tasks.filter((t) => t.type === 'work' && t.status === 'todo').forEach(moveToTomorrow);
    save(); closeSheet(); renderAll();
    toast('Робочі задачі перенесено на завтра');
  },
  demo: seedDemo,
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el);
});

function seedDemo() {
  const W = (title, result, minutes, extra = {}) => ({ id: uid(), title, result, minutes, type: 'work', status: 'todo', extra: 0, ...extra });
  state.tasks = [
    W('Пошта і задачі від ліда', 'Усі задачі з голосових записані в план', 30),
    W('Макет головної для клієнта', "Перший екран + меню у Figma, готові на рев'ю", 60),
    W('Правки банера', '3 розміри банера з правками віддані', 30),
    W('Сайт клієнта: структура', 'Карта сайту і список сторінок', 120),
    W('UX: кейс-стаді', 'Розібраний 1 кейс і 3 записані інсайти', 60, { type: 'learn', challenge: 'ux' }),
  ];
  save();
  renderAll();
}

/* ================= Старт ================= */

renderAll();
setInterval(tick, 1000);
setInterval(() => {
  if (state.date !== todayKey()) { state = rollover(state); save(); renderAll(); return; }
  renderGrid();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (state.date !== todayKey()) { state = rollover(state); save(); }
  renderAll();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
