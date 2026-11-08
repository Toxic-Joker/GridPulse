// Widget renderers, keyed like WIDGETS in server/show.js. Each takes the on-air
// SessionSnapshot (or null) and the overlay show settings, and returns DOM from h().
// TODO(race mode): sessionBug, ticker, tower, results.
// TODO(standings): championship, projected, championshipFull, waiting.
// TODO(radar): radar and radarFull via trackRadar.js.

import { h } from './dom.js';

const placeholder = (label) => () => h('div', { class: 'scaffold-placeholder' }, `${label} — coming soon`);

export const WIDGETS = {
  sessionBug: { render: (frame) => h('div', { class: 'scaffold-placeholder' }, frame ? `${frame.session.meetingName} · ${frame.session.name}` : 'GridPulse · waiting for a session') },
  ticker: { render: placeholder('Race control') },
  tower: { render: placeholder('Timing tower') },
  radar: { render: placeholder('Track radar') },
};
