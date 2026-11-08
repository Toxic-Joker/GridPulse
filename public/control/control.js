// Scaffold control room: status, widget buttons, delay, F1 TV token and OBS links.
// TODO(control room): port MatchRoom's full control room (tabs, preview, themes, socials, deck links)
//   and add the session picker (live / replay with speed).

import { h } from '/overlay/dom.js';

function readToken() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromHash = hash.get('token');
  if (fromHash) {
    sessionStorage.setItem('gridpulse-token', fromHash);
    history.replaceState(null, '', location.pathname);
    return fromHash;
  }
  return sessionStorage.getItem('gridpulse-token') || '';
}

addEventListener('hashchange', () => { if (location.hash.includes('token=')) location.reload(); });

const root = document.getElementById('app');
const token = readToken();
let catalog = null;
let state = null;

if (!token) {
  root.replaceChildren(h('main', { class: 'locked' },
    h('h1', null, 'GridPulse'),
    h('p', null, 'Open the control room link printed in the terminal when GridPulse starts.'),
    h('p', null, 'The token is also saved in data/tokens.json.')));
} else {
  const socket = io('/control', { auth: { token } });
  const send = (action) => socket.emit('action', action, (reply) => { if (reply?.error) alert(reply.error); });

  let recordings = [];
  async function loadRecordings() {
    try {
      const res = await fetch('/api/recordings', { headers: { Authorization: `Bearer ${token}` } });
      recordings = (await res.json()).recordings || [];
    } catch { recordings = []; }
    render();
  }
  loadRecordings();

  socket.on('catalog', (c) => { catalog = c; render(); });
  socket.on('state', (s) => { state = s; render(); });
  socket.on('connect_error', () => root.replaceChildren(h('p', null, 'Could not connect. Check the control room link.')));

  function render() {
    if (!catalog || !state) return;
    const overlayUrl = `${location.origin}/overlay/?token=${encodeURIComponent(catalog.overlayToken)}`;
    const groups = {};
    Object.entries(catalog.widgets).forEach(([id, w]) => { (groups[w.group] ||= []).push([id, w]); });
    const tokenInput = h('input', { type: 'password', placeholder: 'Paste F1 TV token', autocomplete: 'off' });
    const live = state.live;
    const picker = h('select', { 'aria-label': 'Recording to replay' },
      h('option', { value: '' }, recordings.length ? 'Choose a recording' : 'No recordings yet: follow a live session first'),
      recordings.map((r) => h('option', { value: r.id, selected: r.id === state.show.replay.recording },
        `${r.meetingName} · ${r.name} · recorded ${new Date(r.recordedAt).toLocaleString()}`)));
    root.replaceChildren(h('main', null,
      h('h1', null, 'GridPulse'),
      h('p', null, `Feed: ${state.status.state} · ${state.status.message}`),
      live && h('p', null, `${live.session.meetingName} · ${live.session.name} · lap ${live.laps.current}/${live.laps.total ?? '?'} · ${live.track.status.toUpperCase()} · ${live.drivers.slice(0, 3).map((d) => d.code).join(', ')}`),
      h('section', null,
        h('h2', null, 'Session'),
        state.next && h('p', null, `Next: ${state.next.meeting} · ${state.next.name} · ${new Date(state.next.at).toLocaleString()}`),
        h('label', null, h('input', { type: 'checkbox', 'data-auto': '', checked: state.show.autoLive }), ' Follow live sessions automatically (15 minutes before the start)'),
        h('button', { 'data-live': '' }, 'Follow the live session now'),
        h('div', null, picker, h('button', { 'data-replay': '' }, 'Replay'),
          catalog.replaySpeeds.map((s) => h('button', { 'data-speed': s, class: state.show.replay.speed === s ? 'on' : '' }, `${s}×`)))),
      h('section', null,
        h('h2', null, 'Widgets'),
        Object.entries(groups).map(([group, items]) => h('div', null,
          h('h3', null, group),
          items.map(([id, w]) => h('button', {
            class: state.show.widgets[id]?.on ? 'on' : '',
            'aria-pressed': String(Boolean(state.show.widgets[id]?.on)),
          }, w.label))))),
      h('section', null,
        h('h2', null, 'Broadcast delay'),
        h('p', null, `${state.show.delaySeconds} s`),
        [-5, -1, 1, 5].map((by) => h('button', { 'data-delay': by }, `${by > 0 ? '+' : ''}${by} s`))),
      h('section', null,
        h('h2', null, 'F1 TV (optional)'),
        h('p', null, state.f1tv.present ? (state.f1tv.expired ? 'Token expired: the radar uses estimated positions.' : 'Token saved: exact live positions.') : 'No token: the radar uses estimated positions.'),
        tokenInput,
        h('button', { 'data-save-token': '' }, 'Save'),
        h('button', { 'data-clear-token': '' }, 'Remove')),
      h('section', null,
        h('h2', null, 'Add to OBS'),
        h('p', null, 'Browser source, 1920×1080:'),
        h('code', null, overlayUrl))));

    // Handlers are attached here rather than through attributes, to keep the CSP strict.
    root.querySelector('[data-auto]').addEventListener('change', (e) => send({ name: 'autoLive', on: e.target.checked }));
    root.querySelector('[data-live]').addEventListener('click', () => send({ name: 'follow', source: 'live' }));
    root.querySelector('[data-replay]').addEventListener('click', () => send({ name: 'follow', source: 'replay', recording: picker.value }));
    root.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => send({ name: 'replaySpeed', speed: Number(b.dataset.speed) })));
    const buttons = root.querySelectorAll('section:nth-of-type(2) button');
    Object.values(groups).flat().forEach(([id], i) => buttons[i]?.addEventListener('click', () => send({ name: 'widget', id })));
    root.querySelectorAll('[data-delay]').forEach((b) => b.addEventListener('click', () => send({ name: 'delay', by: Number(b.dataset.delay) })));
    root.querySelector('[data-save-token]').addEventListener('click', () => { send({ name: 'f1tvToken', token: tokenInput.value }); tokenInput.value = ''; });
    root.querySelector('[data-clear-token]').addEventListener('click', () => send({ name: 'f1tvToken', token: '' }));
  }
}
