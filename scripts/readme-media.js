// Regenerates the README images in docs/media/ from the real overlay.
//
//   node scripts/readme-media.js
//
// It starts GridPulse in-process with a throwaway data folder, plays the rehearsal race
// and qualifying, and takes screenshots with a local Chrome or Edge (headless, driven
// over the DevTools protocol with Node's built-in WebSocket: no extra dependencies).
// Set CHROME_PATH if your browser is somewhere unusual. The countdown needs the network
// (the calendar comes from Jolpica); everything else runs offline.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { createApp } = require('../server/app');

const OUT = path.join(__dirname, '..', 'docs', 'media');
const SRC = path.join(OUT, 'src');
const W = 1920;
const H = 1080;
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[media]', ...a);

// ── A small DevTools protocol client ───────────────────────────────
async function launchBrowser() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gridpulse-chrome-'));
  const child = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    child.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) resolve(m[1]);
    });
    child.on('exit', () => reject(new Error('Browser exited before it was ready')));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const waiting = new Map();
  const listeners = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    id += 1;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page('Page.enable');
  const page$ = {
    async size(width, height) {
      await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    },
    async goto(url, settleMs = 1500) {
      const loaded = new Promise((r) => { const l = (m) => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); r(); } }; listeners.push(l); });
      await page('Page.navigate', { url });
      await loaded;
      await sleep(settleMs);
    },
    async eval(expression) {
      const { result } = await page('Runtime.evaluate', { expression, returnByValue: true });
      return result.value;
    },
    evalHeight() {
      return this.eval('document.documentElement.scrollHeight');
    },
    async shot(file, clip) {
      const { data } = await page('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      log('wrote', path.relative(process.cwd(), file));
    },
  };
  return { page: page$, close: () => { ws.close(); child.kill(); } };
}

// ── GridPulse, in-process ──────────────────────────────────────────
async function startApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gridpulse-media-'));
  const app = createApp({ dataDir, env: {}, schedule: false });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  app.start();
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const control = io(`${base}/control`, { auth: { token: app.tokens.control }, transports: ['websocket'] });
  const overlay = io(`${base}/overlay`, { auth: { token: app.tokens.overlay }, transports: ['websocket'] });
  await Promise.all([new Promise((r) => control.on('connect', r)), new Promise((r) => overlay.on('connect', r))]);
  const act = (a) => new Promise((resolve, reject) => control.emit('action', a, (res) => (res?.error ? reject(new Error(res.error)) : resolve())));
  const widgets = async (on) => {
    const all = ['preview', 'weather', 'championship', 'projected', 'tower', 'tyres', 'socials', 'sponsor', 'radar', 'knockout', 'waiting', 'results', 'radarFull', 'championshipFull'];
    for (const id of all) await act({ name: 'widget', id, on: on.includes(id) });
  };
  // Resolves when the overlay is sent a moment of this type that goes on air.
  const nextEvent = (type, test = () => true, timeoutMs = 240000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { overlay.off('event', handler); reject(new Error(`No ${type} within ${timeoutMs / 1000}s`)); }, timeoutMs);
    function handler(e) {
      if (e.type === type && e.display !== 'off' && test(e)) { clearTimeout(timer); overlay.off('event', handler); resolve(e); }
    }
    overlay.on('event', handler);
  });
  const stop = () => {
    control.close();
    overlay.close();
    app.close();
    app.server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
  return { base, tokens: app.tokens, act, widgets, nextEvent, stop };
}

// Slot rectangles on the 1920×1080 canvas, matching overlay.css.
const SLOT = {
  leftTop: { x: 24, y: 164, width: 410, height: 565 },
  leftBottom: { x: 24, y: 745, width: 410, height: 311 },
  rightTop: { x: 1486, y: 164, width: 410, height: 565 },
  bottom: { x: 458, y: 745, width: 1004, height: 311 },
  bug: { x: 560, y: 10, width: 800, height: 150 },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gridpulse-shots-'));
  const shotPath = (name) => path.join(tmp, name);
  const browser = await launchBrowser();
  const { page } = browser;
  const gp = await startApp();
  const overlayUrl = `${gp.base}/overlay/?token=${gp.tokens.overlay}`;

  try {
    // Designed images.
    await page.size(1600, 500);
    for (const name of ['banner', 'delay']) {
      await page.goto(`file:///${path.join(SRC, `${name}.html`).replace(/\\/g, '/')}`, 600);
      await page.shot(path.join(OUT, `${name}.png`));
    }

    // ── The rehearsal race ──
    await page.size(W, H);
    await gp.act({ name: 'cameraGuide', on: true });
    await gp.act({ name: 'followedDrivers', codes: ['ALV'] });
    await gp.widgets(['tower', 'radar', 'projected', 'socials']);
    await gp.act({ name: 'replaySpeed', speed: 20 });
    await page.goto(overlayUrl);
    await gp.act({ name: 'follow', source: 'replay', recording: 'rehearsal-harbour-gp-v1.jsonl' });

    await gp.nextEvent('lights_out');
    await sleep(1100);
    await page.shot(shotPath('lights-out.png'));

    // The hero shot: an overtake banner once the field has spread out, with the leaders on the tower.
    for (;;) {
      await gp.nextEvent('overtake', (e) => e.display === 'banner');
      await sleep(900);
      const ready = await page.eval(`(() => {
        const lap = Number((/lap (\\d+)/i.exec(document.querySelector('.sb-lap')?.textContent || '') || [])[1] || 0);
        return lap >= 5 && document.querySelector('.tower-page')?.textContent === '1/2' && Boolean(document.querySelector('.banner.on'));
      })()`);
      if (ready) break;
    }
    await page.shot(path.join(OUT, 'race.png'));
    await page.shot(shotPath('banner-overtake.png'), { x: 560, y: 150, width: 800, height: 90 });
    await page.shot(shotPath('tower.png'), SLOT.rightTop);
    await page.shot(shotPath('radar.png'), SLOT.bottom);
    await page.shot(shotPath('projected.png'), SLOT.leftBottom);
    await page.shot(shotPath('bug.png'), SLOT.bug);

    await gp.widgets(['tyres', 'weather', 'radar', 'championship']);
    await sleep(1200);
    await page.shot(shotPath('tyres.png'), SLOT.rightTop);
    await page.shot(shotPath('weather.png'), SLOT.leftTop);
    await page.shot(shotPath('championship-panel.png'), SLOT.leftBottom);
    await gp.widgets(['radarFull']);
    await sleep(1500);
    await page.shot(shotPath('radar-full.png'));
    await gp.widgets(['tower', 'radar', 'projected', 'socials']);

    await gp.nextEvent('track_status', (e) => e.status === 'sc');
    await sleep(900);
    await page.shot(shotPath('safety-car.png'));
    await page.shot(shotPath('banner-sc.png'), { x: 560, y: 0, width: 800, height: 240 });

    await gp.nextEvent('chequered');
    await sleep(1500);
    await page.shot(shotPath('chequered.png'));
    await sleep(9000);
    await gp.widgets(['results']);
    await sleep(1500);
    await page.shot(shotPath('results.png'));
    await gp.widgets(['championshipFull']);
    await sleep(1500);
    await page.shot(shotPath('championship.png'));

    // ── The rehearsal qualifying ──
    await gp.widgets(['tower', 'knockout']);
    await gp.act({ name: 'follow', source: 'replay', recording: 'rehearsal-harbour-gp-quali-v1.jsonl' });
    await gp.nextEvent('escape');
    await sleep(900);
    await page.shot(path.join(OUT, 'qualifying.png'));
    await page.shot(shotPath('knockout.png'), SLOT.bottom);
    await page.shot(shotPath('tower-quali.png'), SLOT.rightTop);
    // At 20× the next part's banner can go on air first: wait for the knockouts themselves.
    await gp.nextEvent('knockouts');
    await waitFor(page, "document.querySelector('.banner.on')?.textContent.includes('Knocked out')");
    await sleep(500);
    await page.shot(shotPath('banner-knockouts.png'), { x: 360, y: 150, width: 1200, height: 90 });

    // ── Countdown (needs the network for the calendar) ──
    await gp.widgets(['waiting']);
    await sleep(4000);
    await page.shot(shotPath('countdown.png'));

    // ── Control room ──
    await page.size(1280, 900);
    await page.goto(`${gp.base}/control/#token=${gp.tokens.control}`, 2000);
    await page.shot(path.join(OUT, 'control-room.png'));

    // ── Galleries, laid out like MatchRoom's ──
    const img = (file) => `file:///${shotPath(file).replace(/\\/g, '/')}`;
    const gallery = (title, items, columns, width) => `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: 'Barlow Condensed'; font-weight: 700; src: url('file:///${path.join(__dirname, '..', 'public/vendor/fonts/barlow-condensed-latin-700-normal.woff2').replace(/\\/g, '/')}') format('woff2'); }
html, body { margin: 0; background: #070a14; width: ${width}px; }
.grid { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 28px 36px; padding: 36px; align-items: start; }
figure { margin: 0; } img { display: block; width: 100%; height: auto; }
figcaption { margin-top: 10px; color: #f3f5fb; font: 700 30px 'Barlow Condensed', sans-serif; }
.wide { grid-column: span 2; }
</style><title>${title}</title><div class="grid">${items.map(([file, caption, cls]) => `<figure class="${cls || ''}"><img src="${img(file)}"><figcaption>${caption}</figcaption></figure>`).join('')}</div>`;

    const render = async (html, out, width) => {
      const file = path.join(tmp, `${path.basename(out, '.png')}.html`);
      fs.writeFileSync(file, html);
      await page.size(width, 400);
      await page.goto(`file:///${file.replace(/\\/g, '/')}`, 800);
      const { height } = await measure(page, file);
      await page.size(width, height);
      await page.shot(out);
    };

    await render(gallery('widgets', [
      ['bug.png', 'Session bar with flag and lap count', 'wide'],
      ['banner-overtake.png', 'Race moments, with the team colour', 'wide'],
      ['tower.png', 'Timing tower, 11 cars a page'],
      ['tower-quali.png', 'Qualifying timesheet with the cut line'],
      ['tyres.png', 'Tyre strategy'],
      ['weather.png', 'Weather'],
      ['radar.png', 'Track radar', 'wide'],
      ['knockout.png', 'Qualifying drop zone', 'wide'],
      ['projected.png', 'Projected championship'],
      ['championship-panel.png', 'Championship'],
      ['banner-knockouts.png', 'Knockouts, one banner per part', 'wide'],
    ], 4, 1600), path.join(OUT, 'widgets.png'), 1600);

    await render(gallery('screens', [
      ['lights-out.png', 'Lights out'],
      ['safety-car.png', 'Safety car'],
      ['chequered.png', 'Chequered flag and podium'],
      ['results.png', 'Results'],
      ['championship.png', 'Championship'],
      ['radar-full.png', 'Track radar, full screen'],
      ['countdown.png', 'Countdown to the next session'],
    ], 3, 1600), path.join(OUT, 'screens.png'), 1600);
  } finally {
    gp.stop();
    browser.close();
  }
  log('done');
  process.exit(0);
}

// Polls the page until an expression is true, for moments whose timing depends on a queue.
async function waitFor(page, expression, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await page.eval(expression)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

// The page height, so a gallery is captured whole.
async function measure(page) {
  return { height: await page.evalHeight() };
}

main().catch((err) => {
  console.error('[media] failed:', err.message);
  process.exit(1);
});
