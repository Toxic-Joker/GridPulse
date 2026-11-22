// The on-air page. It holds no state of its own beyond what the server sends, which
// is why reloading an OBS source mid-race brings everything straight back.
// Structure from MatchRoom: layers, slots (the most recently lit widget wins its slot),
// a banner queue and a full-screen moment sheet. The session bar and ticker are F1's.

import { h, visibleOn, textOn, formatClock } from './dom.js';
import { translator } from './i18n.js';
import { WIDGETS, teamBar } from './widgets.js';
import { TrackRadar } from './trackRadar.js';

const params = new URLSearchParams(location.search);
const FORMAT = params.get('format') === 'portrait' ? 'portrait' : 'landscape';
const LAYER = ['back', 'front'].includes(params.get('layer')) ? params.get('layer') : 'all';
const PREVIEW = params.has('preview');
const SIZE = FORMAT === 'portrait' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };

const SLOT_OF = {
  preview: 'leftTop', weather: 'leftTop', championship: 'leftBottom', projected: 'leftBottom',
  tower: 'rightTop', tyres: 'rightTop', socials: 'rightBottom', sponsor: 'rightBottom',
  radar: 'bottom', knockout: 'bottom', waiting: 'full', results: 'full', radarFull: 'full', championshipFull: 'full',
};
// Portrait (?format=portrait, 1080×1920, for TikTok) has room for one large and one small
// panel under the camera, so the landscape slots share them, as in MatchRoom. Unlike
// MatchRoom, the strip under the camera goes to the small panel: the radar and drop zone
// are already that wide, flat shape, and the tower keeps the large one during a race.
const PORTRAIT_AREA = { leftTop: 'main', rightTop: 'main', bottom: 'sub', leftBottom: 'sub', rightBottom: 'sub', full: 'full' };
const FLAG = {
  yellow: { key: 'yellow', colour: '#f5d300' },
  sc: { key: 'safetyCar', colour: '#ff8a00' },
  vsc: { key: 'vsc', colour: '#ff8a00' },
  vsc_ending: { key: 'vscEnding', colour: '#ffb54d' },
  red: { key: 'redFlag', colour: '#e10600' },
};
const TICKER_SECONDS = 8;
const TOWER_PAGE_SECONDS = 10;

const stage = document.getElementById('stage');
stage.className = `fmt-${FORMAT} layer-${LAYER}${PREVIEW ? ' preview' : ''}`;
stage.style.width = `${SIZE.w}px`;
stage.style.height = `${SIZE.h}px`;

function fit() {
  const scale = Math.min(innerWidth / SIZE.w, innerHeight / SIZE.h);
  stage.style.transform = Math.abs(scale - 1) < 0.001 ? 'none' : `scale(${scale})`;
}
addEventListener('resize', fit);
fit();

const state = { format: FORMAT, show: null, frame: null, radar: null, tables: {}, towerPage: 0, socialIndex: 0, nowMs: Date.now() };
let t = translator('en');

// ── Static structure ─────────────────────────────────────────────
const backdrop = h('div', { class: 'backdrop' },
  h('img', { class: 'backdrop-image', alt: '' }),
  h('svg', { class: 'backdrop-lines', viewBox: '0 0 1920 1080', preserveAspectRatio: 'xMidYMid slice' },
    h('line', { x1: -200, y1: 1180, x2: 900, y2: -100 }), h('line', { x1: 300, y1: 1180, x2: 1400, y2: -100 }), h('line', { x1: 1100, y1: 1180, x2: 2200, y2: -100 })));
const cameraFrame = h('div', { class: 'camera-frame' }, h('span'));
const slots = {};
const areaNames = FORMAT === 'portrait' ? ['main', 'sub', 'full'] : ['leftTop', 'leftBottom', 'rightTop', 'rightBottom', 'bottom', 'full'];
areaNames.forEach((name) => { slots[name] = h('div', { class: `slot slot-${name}` }); });

const bug = {
  meeting: h('b', { class: 'sb-meeting' }),
  session: h('span', { class: 'sb-session' }),
  lap: h('b', { class: 'sb-lap' }),
  flag: h('span', { class: 'sb-flag' }),
};
bug.el = h('div', { class: 'session-bug' },
  h('div', { class: 'sb-name' }, bug.meeting, bug.session),
  h('div', { class: 'sb-count' }, bug.lap),
  bug.flag);
const ticker = h('div', { class: 'ticker' });
const bannerEl = h('div', { class: 'banner' });
const momentSheet = h('div', { class: 'moment-sheet' });

const front = h('div', { class: 'front' }, cameraFrame, Object.values(slots), bug.el, ticker, bannerEl, momentSheet);
if (LAYER !== 'front') stage.append(backdrop);
if (LAYER !== 'back') stage.append(front);

// ── Session clock (practice and qualifying count down) ───────────
const clock = { ms: null, running: false, rate: 1, at: performance.now() };
function syncClock(c) {
  if (!c) return;
  clock.ms = c.remainingMs;
  clock.running = c.running;
  clock.rate = c.rate || 1;
  clock.at = performance.now();
}
const clockMs = () => (clock.ms === null ? null : Math.max(0, clock.ms - (clock.running ? (performance.now() - clock.at) * clock.rate : 0)));

// ── Drawing ──────────────────────────────────────────────────────
function applyTheme() {
  const { theme, background } = state.show;
  const root = document.documentElement.style;
  [['--ink', theme.ink], ['--raised', theme.raised], ['--chalk', theme.chalk], ['--muted', theme.muted], ['--accent', theme.accent], ['--on-accent', theme.onAccent], ['--back1', theme.back1], ['--back2', theme.back2]]
    .forEach(([k, v]) => root.setProperty(k, v));
  const image = backdrop.querySelector('.backdrop-image');
  if (background) { image.src = background; image.classList.add('on'); } else { image.removeAttribute('src'); image.classList.remove('on'); }
  document.documentElement.lang = state.show.lang;
}

function countText(f) {
  if (['race', 'sprint'].includes(f.session.type)) return `${t('lap')} ${f.laps.current}${f.laps.total ? `/${f.laps.total}` : ''}`;
  const ms = clockMs();
  const part = f.session.part ? `${partName(f.session.part)} ` : '';
  return ms === null ? part.trim() : `${part}${formatClock(ms / 1000)}`;
}

function drawBug() {
  const f = state.frame;
  bug.el.classList.toggle('on', Boolean(state.show.widgets.sessionBug.on));
  if (!f) {
    bug.meeting.textContent = 'GridPulse';
    bug.session.textContent = t('waiting');
    bug.lap.textContent = '';
    bug.flag.className = 'sb-flag';
    return;
  }
  bug.meeting.textContent = f.session.meetingName.replace(/ Grand Prix$/, ' GP');
  bug.session.textContent = t(f.session.type);
  bug.lap.textContent = countText(f);
  const chequered = ['finished', 'ended'].includes(f.status);
  const flag = chequered ? { key: 'chequered', colour: null } : FLAG[f.track.status];
  bug.flag.className = `sb-flag${flag ? ' on' : ''}${chequered ? ' chequered' : ''}`;
  bug.flag.textContent = flag ? t(flag.key) : '';
  bug.flag.style.background = flag?.colour ?? '';
  bug.flag.style.color = flag?.colour ? textOn(flag.colour) : '';
}

// The radars keep their own drawing between frames, so they live outside the redraw-on-change widgets.
const RADARS = {
  radar: new TrackRadar({ aspect: FORMAT === 'portrait' ? 2.7 : 3.25, labelled: 5 }),
  radarFull: new TrackRadar({ aspect: FORMAT === 'portrait' ? 0.62 : 1.9, labelled: 22 }),
};

const widgetEls = new Map();
function ensureWidget(id, area) {
  if (widgetEls.has(id)) return widgetEls.get(id);
  const el = h('div', { class: `widget widget-${id}` });
  slots[area].append(el);
  const entry = { el, sig: null };
  widgetEls.set(id, entry);
  return entry;
}

// Which widget wins each area: the most recently lit. Landscape slots hold one by design.
function winners() {
  const best = {};
  Object.entries(SLOT_OF).forEach(([id, slot]) => {
    const w = state.show.widgets[id];
    if (!w?.on || !(WIDGETS[id] || RADARS[id])) return;
    const area = FORMAT === 'portrait' ? PORTRAIT_AREA[slot] : slot;
    if (!best[area] || w.at > best[area].at) best[area] = { id, at: w.at };
  });
  return best;
}

function drawWidgets() {
  const current = winners();
  Object.entries(WIDGETS).forEach(([id, def]) => {
    const slot = SLOT_OF[id];
    const area = FORMAT === 'portrait' ? PORTRAIT_AREA[slot] : slot;
    const on = current[area]?.id === id;
    if (!on && !widgetEls.has(id)) return;
    const entry = ensureWidget(id, area);
    entry.el.classList.toggle('on', on);
    if (!on) return;
    const data = def.data(state);
    const sig = JSON.stringify([data, state.show.lang]);
    if (sig === entry.sig) return;
    entry.sig = sig;
    entry.el.replaceChildren(def.render(data, { t, format: FORMAT }));
  });
  Object.entries(RADARS).forEach(([id, radar]) => {
    const slot = SLOT_OF[id];
    const area = FORMAT === 'portrait' ? PORTRAIT_AREA[slot] : slot;
    const on = current[area]?.id === id;
    if (!on && !widgetEls.has(id)) return;
    const entry = ensureWidget(id, area);
    entry.el.classList.toggle('on', on);
    if (entry.sig === null) {
      entry.sig = 'radar';
      entry.el.replaceChildren(id === 'radarFull'
        ? h('div', { class: 'sheet radar-sheet' }, radar.el)
        : h('div', { class: 'panel radar-panel' }, radar.el));
    }
    radar.el.classList.toggle('is-3d', id === 'radar' && state.show.widgets.radar.opts?.mode === '3d');
  });
  front.classList.toggle('full-on', Boolean(current.full) && current.full.id !== 'radarFull');
}

function drawRadars() {
  Object.values(RADARS).forEach((radar) => {
    radar.setCircuit(state.tables.circuit);
    if (state.radar) radar.setFrame(state.radar, { trackStatus: state.frame?.track.status, followed: state.show?.followedDrivers, t });
  });
}

function render() {
  if (!state.show) return;
  t = translator(state.show.lang);
  applyTheme();
  const showGuide = state.show.cameraGuide || PREVIEW;
  cameraFrame.classList.toggle('guide', showGuide);
  cameraFrame.firstChild.textContent = showGuide ? t('camera') : '';
  if (LAYER === 'back') return;
  drawBug();
  drawWidgets();
  readRaceControl();
}

// ── Ticker: race control messages and quieter moments, one line at a time ──
const tickerQueue = [];
let tickerTimer = null;
let rcSeen = null;

function pushTicker(text, colour) {
  if (!text || !state.show?.widgets.ticker.on) return;
  tickerQueue.push({ text, colour, queuedAt: performance.now() });
  if (tickerQueue.length > 6) tickerQueue.splice(0, tickerQueue.length - 6);
  if (!tickerTimer) nextTicker();
}

function nextTicker() {
  let item = tickerQueue.shift();
  while (item && performance.now() - item.queuedAt > BANNER_STALE_MS + 5000) item = tickerQueue.shift();
  if (!item) {
    tickerTimer = null;
    ticker.classList.remove('on');
    return;
  }
  ticker.replaceChildren(item.colour ? teamBar(item.colour) : '', h('span', null, item.text));
  ticker.classList.remove('on');
  void ticker.offsetWidth;
  ticker.classList.add('on');
  tickerTimer = setTimeout(nextTicker, TICKER_SECONDS * 1000);
}

// New race control messages arrive inside frames; the first frame is history, not news.
function readRaceControl() {
  const list = state.frame?.raceControl ?? [];
  const latest = list.at(-1)?.at ?? 0;
  if (rcSeen === null) { rcSeen = latest; return; }
  // Blue flags and sector "clear" flags come by the dozen and say nothing to a viewer.
  list.filter((m) => m.at > rcSeen && !['BLUE', 'CLEAR'].includes(m.flag)).forEach((m) => pushTicker(m.message));
  rcSeen = Math.max(rcSeen, latest);
}

// ── Banners and full-screen moments ──────────────────────────────
const bannerQueue = [];
let bannerActive = false;
const surname = (e) => (e.driver ? e.driver.split(' ').slice(-1)[0] : e.code);
// "Q2", or "SQ2" in sprint qualifying.
const partName = (part) => `${state.frame?.session.type === 'sprint_qualifying' ? 'SQ' : 'Q'}${part}`;

function describe(e) {
  const flagTitle = (s) => ({ sc: t('safetyCar'), vsc: t('vsc'), vsc_ending: t('vscEnding'), red: t('redFlag'), yellow: t('yellow'), green: t('trackClear') }[s]);
  switch (e.type) {
    case 'lights_out': return { title: t('lightsOut'), line: e.total ? `${e.total} ${t('laps')}` : '', colour: null, tone: 'red' };
    case 'restart': return { title: t('restart'), line: `${t('lap')} ${e.lap}`, colour: null, tone: 'green' };
    case 'overtake': return { title: t('overtake'), line: `${surname(e)} ${t('on')} ${surname(e.on)} ${t('for')} P${e.forPosition}`, colour: e.teamColour, short: `${e.code} ${t('on')} ${e.on.code} · P${e.forPosition}` };
    case 'new_leader': return { title: t('newLeader'), line: surname(e), colour: e.teamColour };
    case 'pit': return { title: t('pitStop'), line: `${surname(e)} · ${t('stop')} ${e.stop}`, colour: e.teamColour, short: `${t('pit')}: ${e.code}` };
    case 'fastest_lap': return { title: t('fastestLap'), line: `${surname(e)} ${e.time}`, colour: e.teamColour, tone: 'purple' };
    case 'penalty': return { title: t('penalty'), line: e.code ? `${e.code} · ${penaltyText(e.text)}` : penaltyText(e.text), colour: e.teamColour };
    case 'retirement': return { title: t('retirement'), line: surname(e), colour: e.teamColour };
    case 'lap1_summary': return { title: t('lap1'), line: e.gains.map((g) => `${g.code} +${g.change}`).join('  ·  '), colour: null };
    case 'track_status': {
      const title = flagTitle(e.status);
      if (!title) return null;
      return { title, line: '', colour: null, tone: { sc: 'orange', vsc: 'orange', vsc_ending: 'orange', red: 'red', yellow: 'yellow', green: 'green' }[e.status] };
    }
    case 'quali_part': return { title: `${partName(e.part)}`, line: e.cut ? `${t('cutAfter')} P${e.cut}` : t('finalPart'), colour: null };
    case 'session_fastest': return { title: e.pole ? t('provisionalPole') : t('fastestTime'), line: `${surname(e)} ${e.time}`, colour: e.teamColour, tone: 'purple', short: `${e.code} ${e.time}` };
    case 'knockouts': return { title: `${t('knockedOut')} · ${partName(e.part)}`, line: e.cars.map((c) => c.code).join('  ·  '), colour: null, tone: 'red', seconds: 8 };
    case 'escape': return { title: t('safe'), line: `${surname(e)} P${e.position}${e.pushed ? ` · ${surname(e.pushed)} ${t('dropsIn')}` : ''}`, colour: e.teamColour, tone: 'green', short: `${e.code} P${e.position}` };
    case 'lap_deleted': return { title: t('lapDeleted'), line: e.code || '', colour: e.teamColour, short: `${t('lapDeleted')}: ${e.code || ''}` };
    case 'chequered': return { title: t('chequered'), line: e.winner ? `${surname(e.winner)} ${t('wins')}` : '', colour: e.winner?.teamColour, tone: 'chequered', podium: e.podium };
    default: return null;
  }
}

// "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 17 (HOS) - CAUSING A COLLISION" → "5 second time penalty".
function penaltyText(text) {
  const m = /(\d+ SECOND (?:TIME|STOP\/GO) PENALTY|DRIVE THROUGH PENALTY|STOP\/GO PENALTY|GRID PENALTY)/i.exec(text || '');
  const s = (m ? m[1] : text || '').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Flags, leader changes and the like jump the queue and cut a minor banner short;
// a banner that waited too long belongs to a moment viewers have already passed.
const MAJOR = new Set(['lights_out', 'restart', 'new_leader', 'retirement', 'penalty', 'track_status', 'chequered', 'knockouts', 'quali_part', 'escape']);
const BANNER_STALE_MS = 15000;
let bannerTimer = null;
let bannerMajor = false;

function showBanner(content, type) {
  if (!content) return;
  const item = { ...content, major: MAJOR.has(type), queuedAt: performance.now() };
  if (item.major) {
    const firstMinor = bannerQueue.findIndex((b) => !b.major);
    bannerQueue.splice(firstMinor === -1 ? bannerQueue.length : firstMinor, 0, item);
    if (bannerActive && !bannerMajor) { clearTimeout(bannerTimer); nextBanner(); return; }
  } else {
    bannerQueue.push(item);
  }
  if (!bannerActive) nextBanner();
}

function nextBanner() {
  let b = bannerQueue.shift();
  while (b && performance.now() - b.queuedAt > BANNER_STALE_MS) b = bannerQueue.shift();
  if (!b) {
    bannerActive = false;
    bannerEl.classList.remove('on');
    return;
  }
  bannerActive = true;
  bannerMajor = b.major;
  bannerEl.className = `banner${b.tone ? ` tone-${b.tone}` : ''}`;
  bannerEl.replaceChildren(
    b.colour ? h('span', { class: 'banner-tab', style: { background: visibleOn(`#${b.colour}`, '#888888') } }) : '',
    h('b', { class: 'banner-title' }, b.title),
    b.line ? h('span', { class: 'banner-line' }, b.line) : '');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('on');
  bannerTimer = setTimeout(nextBanner, (b.seconds || 6) * 1000);
}

let momentTimer = null;
function showMoment(c) {
  if (!c) return;
  // The chequered flag keeps its pattern; the podium carries the team colours.
  const colour = c.colour && c.tone !== 'chequered' ? visibleOn(`#${c.colour}`, '#888888') : null;
  momentSheet.className = `moment-sheet${c.tone ? ` tone-${c.tone}` : ''}`;
  momentSheet.replaceChildren(
    h('div', { class: 'moment-slab', style: colour ? { background: colour } : {} }),
    h('div', { class: 'moment-content', style: colour ? { color: textOn(`#${c.colour}`) } : {} },
      h('p', { class: 'moment-word' }, c.title),
      c.line ? h('p', { class: 'moment-line' }, c.line) : '',
      c.podium ? h('ol', { class: 'moment-podium' }, c.podium.map((p, i) => h('li', null, h('b', null, `P${i + 1}`), teamBar(p.teamColour), surname(p)))) : ''));
  void momentSheet.offsetWidth;
  momentSheet.classList.add('on');
  clearTimeout(momentTimer);
  momentTimer = setTimeout(() => momentSheet.classList.remove('on'), (c.podium ? 9 : 5.2) * 1000);
}

function onEvent(e) {
  const content = describe(e);
  if (!content) return;
  if (e.display === 'fullscreen') showMoment(content);
  else if (e.display === 'banner') showBanner(content, e.type);
  else if (e.display === 'ticker') pushTicker(content.short || `${content.title}${content.line ? `: ${content.line}` : ''}`, content.colour);
}

// ── Connection ───────────────────────────────────────────────────
const token = params.get('token') || '';
const socket = io('/overlay', { auth: { token }, transports: ['websocket', 'polling'] });

socket.on('connect_error', (err) => {
  // Shown in the OBS preview only when the link is wrong, never for a brief network blip.
  if (err.message === 'unauthorized') stage.replaceChildren(h('p', { class: 'auth-error' }, 'This overlay link is out of date. Copy it again from the control room.'));
});
socket.on('hello', ({ show, frame, radar, tables }) => {
  state.show = show;
  state.frame = frame;
  state.radar = radar;
  state.tables = tables || {};
  rcSeen = null;
  if (frame) syncClock(frame.clock);
  render();
  drawRadars();
});
socket.on('show', (show) => { state.show = show; render(); });
socket.on('frame', (frame) => {
  state.frame = frame;
  syncClock(frame.clock);
  render();
});
socket.on('tables', (tables) => { state.tables = { ...state.tables, ...tables }; render(); drawRadars(); });
socket.on('radar', (radar) => { state.radar = radar; drawRadars(); });
socket.on('event', onEvent);
socket.on('alert', ({ text, sub, seconds }) => showBanner({ title: text, line: sub, colour: null, seconds }));

// ── Timers ───────────────────────────────────────────────────────
setInterval(() => {
  if (LAYER === 'back' || !state.frame || ['race', 'sprint'].includes(state.frame.session.type)) return;
  bug.lap.textContent = countText(state.frame);
}, 250);
setInterval(() => { state.towerPage += 1; render(); }, TOWER_PAGE_SECONDS * 1000);
setInterval(() => { state.socialIndex += 1; render(); }, 6000);
// The countdown ticks every second while it is on air.
setInterval(() => {
  state.nowMs = Date.now();
  if (state.show?.widgets.waiting?.on) drawWidgets();
}, 1000);
