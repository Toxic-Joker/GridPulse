// Panel widgets, keyed like WIDGETS in server/show.js. Each has data(state), whose
// result decides whether to redraw, and render(data, { t }) returning DOM from h().
// The session bar and ticker are drawn by overlay.js because they are always on air.
// The radars are drawn by trackRadar.js. Still to come: preview, weather, tyres, socials, sponsor.

import { h, visibleOn } from './dom.js';

const TOWER_PAGE = 11;
const COMPOUND = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W', UNKNOWN: '?' };

export function tyreChip(tyre) {
  return h('span', { class: `tyre tyre-${tyre.compound.toLowerCase()}` }, COMPOUND[tyre.compound] ?? '?');
}

export function teamBar(colour) {
  return h('i', { class: 'team-bar', style: { background: visibleOn(`#${colour}`, '#888888') } });
}

// 22 cars don't fit at a readable size, so the tower shows 11 at a time and turns the page.
function towerData(state) {
  const f = state.frame;
  if (!f) return null;
  const pages = Math.max(1, Math.ceil(f.drivers.length / TOWER_PAGE));
  const page = state.towerPage % pages;
  const mode = state.show.widgets.tower.opts?.show === 'gap' ? 'gap' : 'interval';
  const followed = new Set(state.show.followedDrivers || []);
  const race = ['race', 'sprint'].includes(f.session.type);
  return {
    mode, page, pages, race,
    rows: f.drivers.slice(page * TOWER_PAGE, (page + 1) * TOWER_PAGE).map((d) => ({
      position: d.position,
      code: d.code,
      colour: d.teamColour,
      value: d.retired ? 'retired' : d.inPit ? 'pit' : d.position === 1 && race ? null : (race ? (mode === 'gap' ? d.gapToLeader : d.interval) : d.bestLap),
      tyre: d.tyre,
      followed: followed.has(d.code),
      fastest: f.fastestLap?.number === d.number,
      out: d.retired,
    })),
  };
}

function towerRender(d, { t }) {
  if (!d) return h('div', { class: 'panel tower' }, h('div', { class: 'panel-head' }, h('span', null, t('waiting'))));
  const label = (v) => (v === 'retired' ? t('retired') : v === 'pit' ? t('pit') : v);
  return h('div', { class: 'panel tower' },
    h('div', { class: 'panel-head' },
      h('span', null, d.race ? t(d.mode) : t('lap')),
      d.pages > 1 ? h('span', { class: 'tower-page' }, `${d.page + 1}/${d.pages}`) : ''),
    h('ol', { class: 'tower-rows' }, d.rows.map((r) => h('li', { class: `tower-row${r.followed ? ' followed' : ''}${r.out ? ' out' : ''}` },
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
      value: d.retired ? null : race ? (i === 0 ? null : d.gapToLeader) : d.bestLap,
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

export const WIDGETS = {
  tower: { data: towerData, render: towerRender },
  championship: { data: championshipData, render: championshipRender },
  projected: { data: projectedData, render: projectedRender },
  championshipFull: { data: championshipFullData, render: championshipFullRender },
  waiting: { data: waitingData, render: waitingRender },
  results: { data: resultsData, render: resultsRender },
};

