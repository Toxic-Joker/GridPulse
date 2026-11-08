const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { TimingState, mergePatch, decodeZ } = require('../../server/domain/state');
const { raceState } = require('../fixtures/race');

test('patches merge deeply and index keys patch arrays in place', () => {
  const target = { Lines: { 1: { Sectors: [{ Value: '22.1', Segments: [{ Status: 0 }, { Status: 0 }] }], GapToLeader: '+1.0' } } };
  const out = mergePatch(target, { Lines: { 1: { Sectors: { 0: { Segments: { 1: { Status: 2048 } } } } } } });
  assert.deepStrictEqual(out.Lines[1].Sectors[0].Segments, [{ Status: 0 }, { Status: 2048 }]);
  assert.strictEqual(out.Lines[1].Sectors[0].Value, '22.1');
  assert.strictEqual(out.Lines[1].GapToLeader, '+1.0');
  assert.strictEqual(target.Lines[1].Sectors[0].Segments[1].Status, 0, 'target is not mutated');
});

test('race control messages arrive as new indexes and are appended', () => {
  const out = mergePatch({ Messages: [{ Message: 'a' }] }, { Messages: { 1: { Message: 'b' } } });
  assert.deepStrictEqual(out.Messages.map((m) => m.Message), ['a', 'b']);
});

test('_deleted removes keys and _kf markers are dropped', () => {
  const out = mergePatch({ Lines: { 1: { a: 1 }, 2: { a: 2 } } }, { Lines: { _deleted: ['2'] }, _kf: true });
  assert.deepStrictEqual(out, { Lines: { 1: { a: 1 } } });
});

test('.z topics are base64 raw deflate JSON, and only the latest sample is kept', () => {
  const sample = (x) => ({ Timestamp: `t${x}`, Entries: { 7: { Status: 'OnTrack', X: x, Y: 0, Z: 0 } } });
  const z = zlib.deflateRawSync(Buffer.from(JSON.stringify({ Position: [sample(1), sample(2)] }))).toString('base64');
  assert.strictEqual(decodeZ(z).Position.length, 2);
  const state = new TimingState();
  state.apply({ topic: 'Position.z', data: z, at: 0 });
  assert.strictEqual(state.topics.Position.Entries[7].X, 2);
});

test('a full state replaces everything, then patches build on it', () => {
  const state = new TimingState();
  state.apply({ topic: 'Stale', data: { x: 1 }, at: 0 });
  state.apply({ topic: '*', data: raceState(), at: 1000 });
  assert.strictEqual(state.topics.Stale, undefined);
  state.apply({ topic: 'TimingData', data: { Lines: { 8: { Sectors: { 1: { Segments: { 3: { Status: 2049 } } } } } } }, at: 2000 });
  assert.strictEqual(state.topics.TimingData.Lines[8].Sectors[1].Segments[3].Status, 2049);
  assert.strictEqual(state.segmentAt[8], 2000);
  assert.strictEqual(state.segmentAt[7], undefined);
});
