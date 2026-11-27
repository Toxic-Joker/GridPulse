// Panel widgets, keyed like WIDGETS in server/show.js. Each has data(state), whose
// result decides whether to redraw, and render(data, { t }) returning DOM from h().
// The session bar and ticker are drawn by overlay.js because they are always on air.
// The radars are drawn by trackRadar.js.

import { h, visibleOn, icon, crest } from './dom.js';

const TOWER_PAGE = 11;
const COMPOUND = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W', UNKNOWN: '?' };

export function tyreChip(tyre) {
  return h('span', { class: `tyre tyre-${tyre.compound.toLowerCase()}` }, COMPOUND[tyre.compound] ?? '?');
}

export function teamBar(colour) {
  return h('i', { class: 'team-bar', style: { background: visibleOn(`#${colour}`, '#888888') } });
}

// 22 cars don't fit at a readable size, so the tower shows 11 at a time and turns the page.
// Portrait is wide enough for the whole field in two columns, which a phone viewer can
// read without waiting for the page to turn.
function paging(state, count) {
  if (state.format === 'portrait') return { page: 0, pages: 1, size: count, half: Math.ceil(count / 2) };
  const pages = Math.max(1, Math.ceil(count / TOWER_PAGE));
  return { page: state.towerPage % pages, pages, size: TOWER_PAGE, half: null };
}

// Two columns in portrait: the list fills the first column top to bottom, then the second.
const rowsList = (half, items) => h('ol', { class: `tower-rows${half ? ' two-col' : ''}`, style: half ? { 'grid-template-rows': `repeat(${half}, auto)` } : null }, items);

function towerData(state) {
  const f = state.frame;
  if (!f) return null;
  const { page, pages, size, half } = paging(state, f.drivers.length);
  const mode = state.show.widgets.tower.opts?.show === 'gap' ? 'gap' : 'interval';
  const followed = new Set(state.show.followedDrivers || []);
  const race = ['race', 'sprint'].includes(f.session.type);
  const cut = f.qualifying?.cut ?? null;
  // Outside a race the tower is a timesheet: the leader's time, then gaps to it.
  const timesheet = (d) => (d.position === 1 || !d.gapToFastest ? (d.partBest || '') : d.gapToFastest);
  return {
    mode, page, pages, half, race, part: f.session.part,
    rows: f.drivers.slice(page * size, (page + 1) * size).map((d) => ({
      position: d.position,
      code: d.code,
      colour: d.teamColour,
      value: d.retired ? 'retired' : race ? (d.inPit ? 'pit' : d.position === 1 ? null : (mode === 'gap' ? d.gapToLeader : d.interval)) : timesheet(d),
      run: race ? null : d.run,
      tyre: d.tyre,
      followed: followed.has(d.code),
      fastest: f.fastestLap?.number === d.number,
      out: d.retired || d.knockedOut,
      cutBelow: cut !== null && d.position === cut && !d.knockedOut,
    })),
  };
}

function towerRender(d, { t }) {
  if (!d) return h('div', { class: 'panel tower' }, h('div', { class: 'panel-head' }, h('span', null, t('waiting'))));
  const label = (v) => (v === 'retired' ? t('retired') : v === 'pit' ? t('pit') : v);
  return h('div', { class: 'panel tower' },
    h('div', { class: 'panel-head' },
      h('span', null, d.race ? t(d.mode) : d.part ? `Q${d.part} · ${t('timesheet')}` : t('timesheet')),
      d.pages > 1 ? h('span', { class: 'tower-page' }, `${d.page + 1}/${d.pages}`) : ''),
    rowsList(d.half, d.rows.map((r) => h('li', { class: `tower-row${r.followed ? ' followed' : ''}${r.out ? ' out' : ''}${r.cutBelow ? ' cut-below' : ''}${r.run ? ` run-${r.run}` : ''}` },
      h('b', { class: 'tower-pos' }, r.position ?? ''),
      teamBar(r.colour),
      h('b', { class: 'tower-code' }, r.code),
      r.fastest ? h('i', { class: 'fastest-dot', title: 'Fastest lap' }) : '',
      h('span', { class: `tower-value${r.value === 'pit' ? ' pit' : ''}` }, label(r.value) ?? ''),
      tyreChip(r.tyre)))));
}

const surname = (name) => String(name || '').split(' ').slice(-1)[0];

// ── Championship (left, bottom): top five, with followed drivers kept in view ──
const SHORT_ROWS = 5;

function shortTable(rows, followed, key) {
  const top = rows.slice(0, SHORT_ROWS);
  const extra = rows.filter((r) => followed.has(r[key]) && !top.includes(r));
  return [...top.slice(0, SHORT_ROWS - Math.min(extra.length, 2)), ...extra.slice(0, 2)];
}

function championshipData(state) {
  const st = state.tables.standings;
  if (!st) return null;
  const constructors = state.show.widgets.championship.opts?.table === 'constructors';
  const followed = new Set(state.show.followedDrivers || []);
  const rows = constructors
    ? st.constructors.map((c) => ({ position: c.position, label: c.team, points: c.points }))
    : st.drivers.map((d) => ({ position: d.position, label: surname(d.name), code: d.code, team: d.team, points: d.points }));
  return { constructors, round: st.round, rows: shortTable(rows, followed, 'code').map((r) => ({ ...r, followed: followed.has(r.code) })) };
}

function standingRows(rows, extra) {
  return h('ol', { class: 'standing-rows' }, rows.map((r) => h('li', { class: `standing-row${r.followed ? ' followed' : ''}` },
    h('b', { class: 'standing-pos' }, r.position ?? ''),
    h('span', { class: 'standing-name' }, r.label),
    extra ? extra(r) : h('span'),
    h('b', { class: 'standing-pts' }, r.points))));
}

function championshipRender(d, { t }) {
  if (!d) return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', null, t('championship'))), h('p', { class: 'empty-note' }, t('loading')));
  return h('div', { class: 'panel standings' },
    h('div', { class: 'panel-head' }, h('span', null, d.constructors ? t('constructors') : t('drivers')), h('span', { class: 'panel-sub' }, `${t('afterRound')} ${d.round}`)),
    standingRows(d.rows));
}

// ── Projected championship: if the race finished in this order ──
function projectedData(state) {
  const p = state.frame?.projected;
  if (!p) return null;
  const followed = new Set(state.show.followedDrivers || []);
  const rows = p.drivers.map((r) => ({ position: r.position, label: surname(r.name), code: r.code, points: r.points, gained: r.gained, move: r.previous === 99 ? 0 : r.previous - r.position }));
  return { final: p.final, rows: shortTable(rows, followed, 'code').map((r) => ({ ...r, followed: followed.has(r.code) })) };
}

function projectedRender(d, { t }) {
  if (!d) return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', null, t('projected'))), h('p', { class: 'empty-note' }, t('projectedNote')));
  return h('div', { class: 'panel standings' },
    h('div', { class: 'panel-head' }, h('span', null, d.final ? t('championship') : t('projected'))),
    standingRows(d.rows, (r) => h('span', { class: 'standing-move' },
      r.move > 0 ? h('i', { class: 'up' }, `▲${r.move}`) : r.move < 0 ? h('i', { class: 'down' }, `▼${-r.move}`) : '',
      r.gained ? h('i', { class: 'gain' }, `+${r.gained}`) : '')));
}

// ── Full-screen championship: drivers and constructors side by side ──
function championshipFullData(state) {
  const st = state.tables.standings;
  if (!st) return null;
  const followed = new Set(state.show.followedDrivers || []);
  return {
    round: st.round,
    drivers: st.drivers.slice(0, 22).map((d) => ({ position: d.position, label: d.name, code: d.code, points: d.points, followed: followed.has(d.code) })),
    constructors: st.constructors.map((c) => ({ position: c.position, label: c.team, points: c.points })),
  };
}

function championshipFullRender(d, { t }) {
  if (!d) return h('div', { class: 'sheet' }, h('p', { class: 'sheet-kicker' }, t('loading')));
  return h('div', { class: 'sheet table-sheet' },
    h('p', { class: 'sheet-kicker' }, `${t('championship')} · ${t('afterRound')} ${d.round}`),
    h('div', { class: 'standings-full' },
      h('section', null, h('h3', null, t('drivers')), standingRows(d.drivers)),
      h('section', null, h('h3', null, t('constructors')), standingRows(d.constructors))));
}

// ── Countdown to the next session ──
function nextSession(calendar, now) {
  const all = (calendar?.rounds || []).flatMap((r) => r.sessions.map((s) => ({ ...s, meeting: r.name, at: Date.parse(s.startsAt) })));
  return all.filter((s) => s.at > now).sort((a, b) => a.at - b.at)[0] ?? null;
}

function waitingData(state) {
  const { countdown } = state.show;
  const next = nextSession(state.tables.calendar, state.nowMs);
  const target = countdown?.target ?? next?.at ?? null;
  const left = target ? Math.max(0, Math.round((target - state.nowMs) / 1000)) : null;
  return {
    title: countdown?.title || next?.meeting || '',
    session: countdown?.title ? '' : next?.name || '',
    left,
    local: target ? new Date(target).toLocaleString(state.show.lang, { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '',
  };
}

function waitingRender(d, { t }) {
  const hms = (s) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v, i) => (i ? String(v).padStart(2, '0') : String(v))).join(':');
  const days = d.left !== null && d.left >= 86400 ? Math.floor(d.left / 86400) : 0;
  return h('div', { class: 'sheet waiting-sheet' },
    h('p', { class: 'sheet-kicker' }, d.title || t('nextSession')),
    d.session ? h('p', { class: 'waiting-session' }, d.session) : '',
    d.left !== null ? h('p', { class: 'waiting-clock' }, days ? `${days}${t('daysShort')} ${hms(d.left % 86400)}` : hms(d.left)) : h('p', { class: 'waiting-session' }, t('noSession')),
    d.local ? h('p', { class: 'waiting-local' }, d.local) : '');
}

// ── Results / running order, full screen ──
function resultsData(state) {
  const f = state.frame;
  if (!f) return null;
  const race = ['race', 'sprint'].includes(f.session.type);
  return {
    title: `${f.session.meetingName} · ${f.session.name}`,
    final: ['finished', 'ended'].includes(f.status),
    rows: f.drivers.map((d, i) => ({
      position: d.position, name: d.name, code: d.code, team: d.team, colour: d.teamColour,
      laps: race && i === 0 ? d.laps : null,
      // Qualifying is classified on each car's time in the part it reached, not its best of the day.
      value: d.retired ? null : race ? (i === 0 ? null : d.gapToLeader) : (d.partBest || d.bestLap),
      fastest: f.fastestLap?.number === d.number, out: d.retired,
    })),
  };
}

function resultsRender(d, { t }) {
  if (!d) return h('div', { class: 'sheet' }, h('p', { class: 'sheet-kicker' }, t('waiting')));
  const row = (r) => h('li', { class: `result-row${r.out ? ' out' : ''}` },
    h('b', { class: 'result-pos' }, r.position ?? ''),
    teamBar(r.colour),
    h('span', { class: 'result-name' }, surname(r.name) || r.code, h('small', null, r.team)),
    r.fastest ? h('i', { class: 'fastest-dot' }) : h('i'),
    h('span', { class: 'result-value' }, r.out ? t('retired') : r.laps !== null ? `${r.laps} ${t('laps')}` : r.value ?? ''));
  const half = Math.ceil(d.rows.length / 2);
  return h('div', { class: 'sheet table-sheet results-sheet' },
    h('p', { class: 'sheet-kicker' }, `${d.title} · ${d.final ? t('result') : t('runningOrder')}`),
    h('div', { class: 'results-cols' }, h('ol', null, d.rows.slice(0, half).map(row)), h('ol', null, d.rows.slice(half).map(row))));
}

// ── Qualifying drop zone (under the camera): who is out if the session ended now ──
function knockoutData(state) {
  const f = state.frame;
  const q = f?.qualifying;
  if (!q || !q.cut) return q ? { final: true, part: q.part } : null;
  const active = f.drivers.filter((d) => !d.knockedOut);
  const line = active.find((d) => d.position === q.cut);
  const toBeat = line?.partBest || '';
  const secs = (v) => { const m = /^(?:(\d+):)?(\d+\.\d+)$/.exec(v || ''); return m ? (Number(m[1]) || 0) * 60 + Number(m[2]) : null; };
  return {
    part: q.part,
    cut: q.cut,
    toBeat,
    toBeatCode: line?.code ?? '',
    danger: active.filter((d) => d.position > q.cut).map((d) => ({
      position: d.position, code: d.code, colour: d.teamColour, run: d.run,
      short: d.partBest && secs(toBeat) !== null ? `+${(secs(d.partBest) - secs(toBeat)).toFixed(3)}` : '',
    })),
  };
}

function knockoutRender(d, { t }) {
  if (!d) return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', null, t('dropZone'))), h('p', { class: 'empty-note' }, t('dropZoneNote')));
  if (d.final) return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', null, `Q${d.part}`)), h('p', { class: 'empty-note' }, t('finalPart')));
  return h('div', { class: 'panel knockout' },
    h('div', { class: 'panel-head' }, h('span', null, `Q${d.part} · ${t('dropZone')}`),
      h('span', { class: 'panel-sub' }, d.toBeat ? `${t('timeToBeat')} ${d.toBeat} (${d.toBeatCode})` : `${t('cutAfter')} P${d.cut}`)),
    h('div', { class: 'ko-cars' }, d.danger.map((c) => h('div', { class: `ko-car run-${c.run}` },
      teamBar(c.colour), h('b', null, `P${c.position}`), h('span', null, c.code),
      h('small', null, c.run === 'garage' ? t('pit') : c.run === 'out' ? t('outLap') : c.short || t('noTime'))))));
}

// ── Socials and sponsor (from MatchRoom) ──
function socialsData(state) {
  const list = state.show.socials || [];
  return list.length ? { social: list[state.socialIndex % list.length] } : null;
}

function socialsRender(d, { t }) {
  if (!d) return h('div');
  return h('div', { class: 'panel socials' },
    h('div', { class: 'panel-head' }, h('span', null, t('follow'))),
    h('div', { class: 'social-line' }, icon(d.social.platform), h('b', null, d.social.handle)));
}

function sponsorData(state) {
  const { text, logo } = state.show.sponsor || {};
  return text || logo ? { text, logo } : null;
}

function sponsorRender(d, { t }) {
  if (!d) return h('div');
  return h('div', { class: 'panel sponsor' },
    h('div', { class: 'panel-head' }, h('span', null, t('presentedBy'))),
    h('div', { class: 'sponsor-line' }, d.logo ? crest(d.logo, 'sponsor-logo') : '', d.text ? h('b', null, d.text) : ''));
}

// ── Weather ──
function weatherData(state) {
  const w = state.frame?.weather;
  return w ? { ...w } : null;
}

function weatherRender(d, { t }) {
  if (!d) return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', null, t('weather'))), h('p', { class: 'empty-note' }, t('waiting')));
  const fact = (label, value) => h('div', { class: 'weather-fact' }, h('span', null, label), h('b', null, value));
  const deg = (v) => (v === null ? '–' : `${Math.round(v)}°C`);
  return h('div', { class: 'panel weather' },
    h('div', { class: 'panel-head' }, h('span', null, t('weather')), h('span', { class: `weather-rain${d.rainfall ? ' wet' : ''}` }, d.rainfall ? t('rain') : t('dry'))),
    h('div', { class: 'weather-grid' },
      fact(t('trackTemp'), deg(d.trackTemp)),
      fact(t('airTemp'), deg(d.airTemp)),
      fact(t('humidity'), d.humidity === null ? '–' : `${Math.round(d.humidity)}%`),
      fact(t('wind'), d.windSpeed === null ? '–' : `${d.windSpeed.toFixed(1)} m/s`)));
}

// ── Session preview: the circuit, the distance and the front of the grid ──
function previewData(state) {
  const f = state.frame;
  if (!f) return null;
  const grid = f.drivers.filter((d) => d.gridPosition).sort((a, b) => a.gridPosition - b.gridPosition).slice(0, 8)
    .map((d) => ({ position: d.gridPosition, code: d.code, name: d.name, colour: d.teamColour, tyre: d.stints[0] ?? d.tyre }));
  // Practice and qualifying have no starting grid, so the panel shows the running order instead of an empty list.
  const order = grid.length ? [] : f.drivers.filter((d) => d.position).slice(0, 8)
    .map((d) => ({ position: d.position, code: d.code, name: d.name, colour: d.teamColour, tyre: d.tyre ?? {} }));
  return { meeting: f.session.meetingName, circuit: f.session.circuitName, session: f.session.type, laps: f.laps.total, grid: grid.length ? grid : order, onGrid: grid.length > 0 };
}

function previewRender(d, { t }) {
  if (!d) return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', null, t('waiting'))));
  return h('div', { class: 'panel preview' },
    h('div', { class: 'panel-head' }, h('span', null, d.circuit || d.meeting), d.laps ? h('span', { class: 'panel-sub' }, `${d.laps} ${t('laps')}`) : ''),
    h('p', { class: 'preview-kicker' }, `${t(d.session)} · ${t(d.onGrid ? 'grid' : 'runningOrder')}`),
    h('ol', { class: 'tower-rows' }, d.grid.map((g) => h('li', { class: 'tower-row' },
      h('b', { class: 'tower-pos' }, g.position), teamBar(g.colour), h('b', { class: 'tower-code' }, g.code), h('i'),
      h('span', { class: 'tower-value' }, surname(g.name)), tyreChip({ compound: g.tyre?.compound })))));
}

// ── Tyre strategy: every stint so far, as a bar per driver ──
function tyresData(state) {
  const f = state.frame;
  if (!f) return null;
  const { page, pages, size, half } = paging(state, f.drivers.length);
  const total = Math.max(f.laps.total || 0, ...f.drivers.map((d) => d.stints.reduce((a, s) => a + s.laps, 0)), 1);
  return {
    page, pages, half, total,
    rows: f.drivers.slice(page * size, (page + 1) * size).map((d) => ({
      position: d.position, code: d.code, colour: d.teamColour, out: d.retired,
      stints: d.stints.map((s) => ({ compound: s.compound, laps: s.laps })),
    })),
  };
}

function tyresRender(d, { t }) {
  if (!d) return h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', null, t('tyreStrategy'))));
  return h('div', { class: 'panel tyres' },
    h('div', { class: 'panel-head' }, h('span', null, t('tyreStrategy')), d.pages > 1 ? h('span', { class: 'tower-page' }, `${d.page + 1}/${d.pages}`) : ''),
    rowsList(d.half, d.rows.map((r) => h('li', { class: `stint-row${r.out ? ' out' : ''}` },
      h('b', { class: 'tower-pos' }, r.position ?? ''),
      h('b', { class: 'tower-code' }, r.code),
      h('div', { class: 'stint-bar' }, r.stints.map((s) => h('i', { class: `stint stint-${s.compound.toLowerCase()}`, style: { width: `${(s.laps / d.total) * 100}%` } }, s.laps >= 4 ? String(s.laps) : '')))))));
}

export const WIDGETS = {
  tower: { data: towerData, render: towerRender },
  championship: { data: championshipData, render: championshipRender },
  projected: { data: projectedData, render: projectedRender },
  championshipFull: { data: championshipFullData, render: championshipFullRender },
  waiting: { data: waitingData, render: waitingRender },
  results: { data: resultsData, render: resultsRender },
  socials: { data: socialsData, render: socialsRender },
  sponsor: { data: sponsorData, render: sponsorRender },
  weather: { data: weatherData, render: weatherRender },
  preview: { data: previewData, render: previewRender },
  tyres: { data: tyresData, render: tyresRender },
  knockout: { data: knockoutData, render: knockoutRender },
};

