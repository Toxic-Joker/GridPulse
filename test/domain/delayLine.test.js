const test = require('node:test');
const assert = require('node:assert');
const { DelayLine } = require('../../server/domain/delayLine');

test('delay line holds items until the broadcast catches up', () => {
  const line = new DelayLine(30000);
  line.push('frame', 'a', 1000);
  assert.deepStrictEqual(line.release(30999), []);
  assert.deepStrictEqual(line.release(31000).map((i) => i.data), ['a']);
});

test('lowering the delay releases fresh data but drops long-past moments', () => {
  const line = new DelayLine(60000);
  line.push('event', 'old-overtake', 0);
  line.push('frame', 'old-frame', 0);
  line.push('event', 'recent-pit', 45000);
  line.setDelay(0);
  assert.deepStrictEqual(line.release(50000).map((i) => i.data), ['old-frame', 'recent-pit']);
});

test('past its cap the delay line drops the oldest frames, never events', () => {
  const line = new DelayLine(60000, 3);
  line.push('event', 'e1', 0);
  line.push('frame', 'f1', 1);
  line.push('radar', 'r1', 2);
  line.push('frame', 'f2', 3);
  assert.deepStrictEqual(line.queue.map((i) => i.data), ['e1', 'r1', 'f2']);
});
