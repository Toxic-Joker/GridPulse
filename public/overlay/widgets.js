// Widget renderers, keyed like WIDGETS in server/show.js. Each takes the on-air
// SessionSnapshot (or null) and the overlay show settings, and returns DOM from h().
// TODO(race mode): sessionBug, ticker, tower, results.
// TODO(standings): championship, projected, championshipFull, waiting.
// TODO(radar): radar and radarFull via trackRadar.js.

import { h } from './dom.js';

const placeholder = (label) => () => h('div', { class: 'scaffold-placeholder' }, `${label} — coming soon`);

export const WIDGETS = {
  sessionBug: {
    render: (frame) => h('div', { class: 'scaffold-placeholder' }, frame
      ? `${frame.session.meetingName} · ${frame.session.name} · Lap ${frame.laps.current}/${frame.laps.total ?? '?'} · ${frame.track.status.toUpperCase()}`
      : 'GridPulse · waiting for a session'),
  },
  ticker: { render: (frame) => h('div', { class: 'scaffold-placeholder' }, frame?.raceControl.at(-1)?.message ?? 'Race control') },
  // Unstyled until the race-mode widgets are built; shows the data is arriving.
  tower: {
    render: (frame) => h('ol', { class: 'scaffold-placeholder' }, (frame?.drivers ?? []).map((d) => h('li', null,
      `${d.code} ${d.position === 1 ? d.gapToLeader : d.interval} ${d.tyre.compound[0]}${d.tyre.age}${d.retired ? ' OUT' : d.inPit ? ' PIT' : ''}`))),
  },
  radar: { render: placeholder('Track radar') },
};
