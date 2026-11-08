// Replays a recording as FeedMessages, keeping the original spacing divided by the
// speed. Rehearsal runs through exactly the same pipeline as a live session.

const path = require('path');
const { readRecording, listRecordings, isRecordingId } = require('./recordings');

// Long quiet stretches (a red flag, the gap before the start) are shortened in replay.
const MAX_GAP_MS = 10000;

class ReplayProvider {
  constructor({ dataDir, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.dir = path.join(dataDir, 'recordings');
    this.log = log;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.speed = 20;
    this.id = null;
    this.lines = [];
    this.index = 0;
    this.timer = null;
    this.status = { state: 'idle', message: 'Choose a recording to replay' };
  }

  list() {
    return listRecordings(this.dir);
  }

  select(id) {
    if (!isRecordingId(id)) throw new Error('Not a valid recording');
    this.id = id;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  async start(onMessage) {
    this.stop();
    if (!this.id) {
      this.status = { state: 'idle', message: 'Choose a recording to replay' };
      return;
    }
    try {
      this.lines = readRecording(this.dir, this.id);
    } catch (err) {
      this.status = { state: 'error', message: `Could not read the recording: ${err.message}` };
      return;
    }
    this.onMessage = onMessage;
    this.index = 0;
    this.status = { state: 'live', message: `Replaying at ${this.speed}×` };
    this.step();
  }

  step() {
    const line = this.lines[this.index];
    if (!line) {
      this.status = { state: 'finished', message: 'Replay finished' };
      return;
    }
    this.index += 1;
    // Other kinds (the rehearsal's "truth" lines) are for tests, not the feed.
    if (line.kind === 'state') this.onMessage({ topic: '*', data: line.data });
    else if (line.kind === 'msg') this.onMessage({ topic: line.topic, data: line.data });
    const next = this.lines[this.index];
    if (!next) return this.step();
    const gap = Math.min(MAX_GAP_MS, Math.max(0, next.at - line.at)) / this.speed;
    this.timer = this.setTimer(() => this.step(), gap);
    this.timer?.unref?.();
    return undefined;
  }

  stop() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.lines = [];
    this.status = { state: 'idle', message: 'Choose a recording to replay' };
  }
}

module.exports = { ReplayProvider, MAX_GAP_MS };
