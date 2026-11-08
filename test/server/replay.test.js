const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { createApp } = require('../../server/app');
const { listRecordings } = require('../../server/providers/recordings');
const { raceState } = require('../fixtures/race');

const ID = '2026-06-01-14-20-00_90001.jsonl';

function writeRecording(dataDir) {
  const dir = path.join(dataDir, 'recordings');
  fs.mkdirSync(dir, { recursive: true });
  const t0 = 1_000_000;
  const lines = [
    { kind: 'state', at: t0, data: raceState() },
    { kind: 'msg', at: t0 + 100, topic: 'TimingData', data: { Lines: { 8: { Position: '1', Line: 1 }, 7: { Position: '2', Line: 2 } } } },
    // Ten seconds later in the race (half a second at 20×), so the baseline is already taken.
    { kind: 'msg', at: t0 + 10000, topic: 'TrackStatus', data: { Status: '4', Message: 'SCDeployed' } },
    { kind: 'msg', at: t0 + 10100, topic: 'SessionData', data: { StatusSeries: { 2: { Utc: '2026-06-01T14:21:00.000Z', TrackStatus: 'SCDeployed' } } } },
  ];
  fs.writeFileSync(path.join(dir, ID), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
}

test('recordings are listed with their session from the first line', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gridpulse-rec-'));
  writeRecording(dataDir);
  fs.writeFileSync(path.join(dataDir, 'recordings', '../../evil.jsonl'.replace(/[./]/g, '_')), 'not json');
  const list = listRecordings(path.join(dataDir, 'recordings'));
  assert.deepStrictEqual(list.map((r) => [r.id, r.meetingName, r.name]), [[ID, 'Harbour Grand Prix', 'Race']]);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a recording replays through the whole pipeline to the overlay', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gridpulse-replay-'));
  writeRecording(dataDir);
  const instance = createApp({ dataDir, env: {} });
  await new Promise((resolve) => instance.server.listen(0, '127.0.0.1', resolve));
  instance.start();
  const url = `http://127.0.0.1:${instance.server.address().port}`;

  const control = io(`${url}/control`, { auth: { token: instance.tokens.control }, transports: ['websocket'], reconnection: false });
  const overlay = io(`${url}/overlay`, { auth: { token: instance.tokens.overlay }, transports: ['websocket'], reconnection: false });
  t.after(() => {
    control.close();
    overlay.close();
    instance.close();
    instance.server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await Promise.all([new Promise((r) => control.on('connect', r)), new Promise((r) => overlay.on('connect', r))]);

  const frames = [];
  const events = [];
  overlay.on('frame', (f) => frames.push(f));
  overlay.on('event', (e) => events.push(e));

  const refused = await new Promise((r) => control.emit('action', { name: 'follow', source: 'replay', recording: 'nope.jsonl' }, r));
  assert.match(refused.error, /Choose a recording/);
  const reply = await new Promise((r) => control.emit('action', { name: 'follow', source: 'replay', recording: ID }, r));
  assert.deepStrictEqual(reply, { ok: true });

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !(frames.at(-1)?.track.status === 'sc' && events.length)) await new Promise((r) => setTimeout(r, 50));

  const last = frames.at(-1);
  assert.strictEqual(last.session.meetingName, 'Harbour Grand Prix');
  assert.deepStrictEqual(last.drivers.map((d) => d.code), ['BRV', 'ALP', 'CHL']);
  assert.strictEqual(last.track.status, 'sc');
  assert.deepStrictEqual(events.map((e) => [e.type, e.status, e.display]), [['track_status', 'sc', 'banner']]);
});
