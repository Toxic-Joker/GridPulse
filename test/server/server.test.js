const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { createApp } = require('../../server/app');
const { applyAction, defaultShow, ActionError } = require('../../server/show');

async function boot(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gridpulse-test-'));
  const instance = createApp({ dataDir, env, schedule: false });
  await new Promise((resolve) => instance.server.listen(0, '127.0.0.1', resolve));
  instance.start();
  const url = `http://127.0.0.1:${instance.server.address().port}`;
  return { ...instance, url, dataDir };
}

function connect(url, ns, token, extraHeaders) {
  return new Promise((resolve, reject) => {
    const socket = io(`${url}${ns}`, { auth: { token }, transports: ['websocket'], reconnection: false, extraHeaders });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => { socket.close(); reject(err); });
  });
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const stop = (i) => { i.close(); i.server.close(); fs.rmSync(i.dataDir, { recursive: true, force: true }); };

test('sockets refuse missing and wrong tokens', async () => {
  const i = await boot();
  await assert.rejects(connect(i.url, '/overlay', 'nope'), /unauthorized/);
  await assert.rejects(connect(i.url, '/control', ''), /unauthorized/);
  // An overlay link must not open the control channel.
  await assert.rejects(connect(i.url, '/control', i.tokens.overlay), /unauthorized/);
  stop(i);
});

test('a foreign web page cannot open a socket to the server', async () => {
  const i = await boot();
  await assert.rejects(connect(i.url, '/overlay', i.tokens.overlay, { origin: 'https://evil.example' }));
  stop(i);
});

test('the F1 TV token never leaves the server', async () => {
  const i = await boot();
  const secret = 'header.eyJleHAiOjQxMDI0NDQ4MDB9.signature-SECRET';
  const control = await connect(i.url, '/control', i.tokens.control);
  const overlay = await connect(i.url, '/overlay', i.tokens.overlay);
  const seen = [];
  control.onAny((event, payload) => seen.push(JSON.stringify(payload)));
  overlay.onAny((event, payload) => seen.push(JSON.stringify(payload)));

  const reply = await new Promise((resolve) => control.emit('action', { name: 'f1tvToken', token: secret }, resolve));
  assert.deepStrictEqual(reply, { ok: true });
  const state = await once(control, 'state');
  assert.strictEqual(state.f1tv.present, true);
  assert.strictEqual(state.f1tv.expiresAt, 4102444800000);

  await new Promise((r) => setTimeout(r, 400));
  assert.ok(seen.every((s) => !s.includes('SECRET')), 'token appeared in a socket message');
  assert.ok(!fs.readFileSync(path.join(i.dataDir, 'show.json'), 'utf8').includes('SECRET'), 'token saved in show.json');
  control.close();
  overlay.close();
  stop(i);
});

test('lighting a widget replaces its neighbour in the same slot', () => {
  let show = applyAction(defaultShow(), { name: 'widget', id: 'tower', on: true }, 1);
  show = applyAction(show, { name: 'widget', id: 'tyres', on: true }, 2);
  assert.strictEqual(show.widgets.tower.on, false);
  assert.strictEqual(show.widgets.tyres.on, true);
  assert.strictEqual(show.widgets.sessionBug.on, true);
});

test('bad actions are refused', () => {
  assert.throws(() => applyAction(defaultShow(), { name: 'widget', id: 'scorebug' }), ActionError);
  assert.throws(() => applyAction(defaultShow(), { name: 'replaySpeed', speed: 7 }), ActionError);
  assert.throws(() => applyAction(defaultShow(), { name: 'followedDrivers', codes: ['ver1'] }), ActionError);
  assert.strictEqual(applyAction(defaultShow(), { name: 'delay', seconds: 999 }).delaySeconds, 300);
});

test('socials take Snapchat and two accounts on one platform, up to eight', () => {
  const list = [
    { platform: 'twitch', handle: 'streamer' }, { platform: 'youtube', handle: '@streamer' },
    { platform: 'tiktok', handle: '@main' }, { platform: 'tiktok', handle: '@second' },
    { platform: 'instagram', handle: 'streamer' }, { platform: 'x', handle: '@streamer' },
    { platform: 'snapchat', handle: 'streamer' },
  ];
  assert.deepStrictEqual(applyAction(defaultShow(), { name: 'socials', socials: list }).socials, list);
  const nine = Array.from({ length: 9 }, (_, i) => ({ platform: 'x', handle: `@a${i}` }));
  assert.strictEqual(applyAction(defaultShow(), { name: 'socials', socials: nine }).socials.length, 8);
  assert.throws(() => applyAction(defaultShow(), { name: 'socials', socials: [{ platform: 'myspace', handle: 'a' }] }), ActionError);
});
