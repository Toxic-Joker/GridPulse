// The OBS page. Read-only: it renders what the server sends and sends nothing back.
// TODO(overlay): port MatchRoom's overlay shell (slots, enter/exit animations, theme tokens,
//   event banners and full-screen moments, camera guide, ?layer= and ?format=).

import { h } from './dom.js';
import { WIDGETS } from './widgets.js';

const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const stage = document.getElementById('stage');
let show = null;
let frame = null;

function render() {
  if (!show) return;
  const on = Object.entries(show.widgets).filter(([, w]) => w.on);
  stage.replaceChildren(...on.map(([id]) => {
    const widget = WIDGETS[id];
    return h('section', { class: `scaffold-widget widget-${id}` }, widget ? widget.render(frame, show) : id);
  }));
}

const socket = io('/overlay', { auth: { token }, transports: ['websocket', 'polling'] });
socket.on('hello', (msg) => { show = msg.show; frame = msg.frame; render(); });
socket.on('show', (s) => { show = s; render(); });
socket.on('frame', (f) => { frame = f; render(); });
