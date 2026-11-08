// The track radar: circuit outline, corner numbers, team-coloured cars with codes,
// track status colours and a pit list. Frames arrive 4 times a second; dots glide
// between them. Estimated frames carry an "Estimated positions" label, as MatchRoom's
// radar said when its ball was an illustration.

import { h, visibleOn } from './dom.js';

const VIEW = 1000;
const PAD = 40;
const GLIDE_MS = 260;
const TRACK_COLOUR = { green: 'var(--chalk)', yellow: '#f5d300', sc: '#ff8a00', vsc: '#ff8a00', vsc_ending: '#ffb54d', red: '#e10600' };

// Rotates the circuit as MultiViewer says, flips y for the screen, and fits it in the view.
function project(circuit, aspect) {
  const a = (circuit.rotation * Math.PI) / 180;
  const rot = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), -(x * Math.sin(a) + y * Math.cos(a))];
  const pts = circuit.outline.map(rot);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = VIEW;
  const height = VIEW / aspect;
  const scale = Math.min((width - PAD * 2) / (maxX - minX || 1), (height - PAD * 2) / (maxY - minY || 1));
  const offX = (width - (maxX - minX) * scale) / 2;
  const offY = (height - (maxY - minY) * scale) / 2;
  const to = (p) => { const [x, y] = rot(p); return [offX + (x - minX) * scale, offY + (y - minY) * scale]; };
  return { to, width, height };
}

export class TrackRadar {
  constructor({ aspect, labelled = 5 }) {
    this.aspect = aspect;
    this.labelled = labelled;
    this.circuit = null;
    this.proj = null;
    this.cars = new Map();
    this.frame = null;
    this.followed = new Set();
    this.trackStatus = 'green';
    this.t = (k) => k;
    this.outline = h('path', { class: 'radar-track' });
    this.outlineEdge = h('path', { class: 'radar-track-edge' });
    this.start = h('line', { class: 'radar-start' });
    this.corners = h('g', { class: 'radar-corners' });
    this.dots = h('g', { class: 'radar-dots' });
    this.svg = h('svg', { class: 'track-svg', viewBox: `0 0 ${VIEW} ${Math.round(VIEW / aspect)}`, preserveAspectRatio: 'xMidYMid meet' },
      this.outlineEdge, this.outline, this.start, this.corners, this.dots);
    this.note = h('p', { class: 'radar-note' });
    this.pits = h('div', { class: 'radar-pits' });
    this.empty = h('p', { class: 'radar-empty' });
    this.el = h('div', { class: 'track-radar' }, this.svg, this.pits, this.note, this.empty);
    this.raf = null;
  }

  setCircuit(circuit) {
    if (!circuit || circuit === this.circuit) return;
    this.circuit = circuit;
    this.proj = project(circuit, this.aspect);
    const pts = circuit.outline.map(this.proj.to);
    const d = `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}Z`;
    this.outline.setAttribute('d', d);
    this.outlineEdge.setAttribute('d', d);
    const [sx, sy] = this.proj.to(circuit.start);
    this.start.setAttribute('x1', sx - 14); this.start.setAttribute('x2', sx + 14);
    this.start.setAttribute('y1', sy); this.start.setAttribute('y2', sy);
    this.corners.replaceChildren(...circuit.corners.map((c) => {
      const [x, y] = this.proj.to([c.x, c.y]);
      return h('text', { x: x.toFixed(1), y: y.toFixed(1), class: 'radar-corner' }, String(c.number));
    }));
    this.cars.clear();
    this.dots.replaceChildren();
    this.draw();
  }

  setFrame(frame, { trackStatus, followed, t }) {
    this.frame = frame;
    this.trackStatus = trackStatus || 'green';
    this.followed = new Set(followed || []);
    this.t = t || this.t;
    if (!this.proj) { this.draw(); return; }
    const now = performance.now();
    const seen = new Set();
    frame.cars.forEach((c, index) => {
      if (c.x === null || c.y === null || c.inPit || c.retired) return;
      seen.add(c.number);
      const [x, y] = this.proj.to([c.x, c.y]);
      let car = this.cars.get(c.number);
      if (!car) {
        const dot = h('circle', { r: 11, class: 'radar-car' });
        const label = h('text', { class: 'radar-code', dy: -18 });
        const g = h('g', { class: 'radar-car-g' }, dot, label);
        this.dots.append(g);
        car = { g, dot, label, from: [x, y], to: [x, y], at: now };
        this.cars.set(c.number, car);
      }
      const current = this.position(car, now);
      car.from = current;
      car.to = [x, y];
      car.at = now;
      car.dot.setAttribute('fill', visibleOn(`#${c.colour}`, '#888888'));
      const show = index < this.labelled || this.followed.has(c.code);
      car.label.textContent = show ? c.code : '';
      car.g.classList.toggle('leader', index === 0);
      car.g.classList.toggle('followed', this.followed.has(c.code));
      // Leaders are drawn last, so they sit on top of the pack.
      car.order = index;
    });
    this.cars.forEach((car, number) => { if (!seen.has(number)) { car.g.remove(); this.cars.delete(number); } });
    [...this.cars.values()].sort((a, b) => b.order - a.order).forEach((car) => this.dots.append(car.g));
    this.draw();
    this.loop();
  }

  position(car, now) {
    const k = Math.min(1, (now - car.at) / GLIDE_MS);
    return [car.from[0] + (car.to[0] - car.from[0]) * k, car.from[1] + (car.to[1] - car.from[1]) * k];
  }

  draw() {
    const f = this.frame;
    this.outline.style.stroke = TRACK_COLOUR[this.trackStatus] || TRACK_COLOUR.green;
    this.note.textContent = f?.mode === 'estimated' ? this.t('estimated') : '';
    this.empty.textContent = this.circuit ? '' : this.t('waitingMap');
    const inPit = (f?.cars || []).filter((c) => c.inPit && !c.retired);
    this.pits.replaceChildren(...(inPit.length ? [h('b', null, this.t('pit')), ...inPit.map((c) => h('span', null, c.code))] : []));
  }

  loop() {
    if (this.raf) return;
    const step = () => {
      const now = performance.now();
      let moving = false;
      this.cars.forEach((car) => {
        const [x, y] = this.position(car, now);
        car.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        if (now - car.at < GLIDE_MS) moving = true;
      });
      this.raf = moving ? requestAnimationFrame(step) : null;
    };
    this.raf = requestAnimationFrame(step);
  }
}
