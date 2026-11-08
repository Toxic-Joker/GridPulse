// Panel widgets, keyed like WIDGETS in server/show.js. Each has data(state), whose
// result decides whether to redraw, and render(data, { t }) returning DOM from h().
// The session bar and ticker are drawn by overlay.js because they are always on air.
// TODO(standings): championship, projected, championshipFull, waiting.
// TODO(radar): radar and radarFull via trackRadar.js.
// TODO: preview, weather, tyres, results, socials, sponsor.

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

export const WIDGETS = {
  tower: { data: towerData, render: towerRender },
};
