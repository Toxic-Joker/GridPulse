// Follows one session: a provider's raw messages → state → snapshot → engine →
// delay line → on air. Snapshots are throttled on the wall clock, so a 20× replay
// sends OBS no more frames than a live session does.

const { DelayLine } = require('./domain/delayLine');
const { TimingState } = require('./domain/state');
const { normalizeSession } = require('./domain/normalize');
const { SessionEngine } = require('./domain/engine');

const TICK_MS = 250;
const SNAPSHOT_MS = 250;

// TODO(radar): radar frames (4 Hz) from positions.js or estimator.js into the delay line as 'radar'.
// TODO(race mode): overtake banner rate limit (one per 5 s, followed drivers and top 3 first).
// TODO(standings): tables from Jolpica only while a widget on air needs them.
// TODO(live): calendar check every minute; connect 15 min before a session, stay until Finalised or 5 h.

class Feed {
  constructor({ providers, getShow, onAir, onChange, log, now = () => Date.now() }) {
    this.providers = providers;
    this.getShow = getShow;
    this.onAir = onAir;
    this.onChange = onChange;
    this.log = log;
    this.now = now;
    this.delay = new DelayLine(0);
    this.provider = null;
    this.source = null;
    this.generation = 0;
    this.state = new TimingState();
    this.engine = new SessionEngine();
    this.dirty = false;
    this.lastSnapshotAt = 0;
    this.live = null;
    this.onAirFrame = null;
    this.onAirRadar = null;
    this.tables = { standings: null, calendar: null };
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.ticker.unref?.();
  }

  get status() {
    if (!this.provider) return { state: 'idle', message: 'Choose a session to follow' };
    return this.provider.status;
  }

  stop() {
    clearInterval(this.ticker);
    this.generation += 1;
    this.provider?.stop();
  }

  async follow(source) {
    const provider = this.providers[source];
    if (!provider) throw new Error(`Unknown data source: ${source}`);
    this.generation += 1;
    const generation = this.generation;
    await this.provider?.stop();
    this.provider = provider;
    this.source = source;
    this.state = new TimingState();
    this.engine = new SessionEngine();
    this.dirty = false;
    this.live = null;
    this.onAirFrame = null;
    this.onAirRadar = null;
    // A new session must not inherit what was waiting for the old one.
    this.delay = new DelayLine(this.getShow().delaySeconds * 1000);
    this.onAir({ kind: 'reset' });
    this.onChange();
    await provider.start((message) => {
      if (generation === this.generation) this.receive(message);
    });
    this.onChange();
  }

  receive({ topic, data }) {
    const at = this.now();
    try {
      this.state.apply({ topic, data, at });
    } catch (err) {
      this.warnOnce(topic, err);
      return;
    }
    // A full state arrives on connect and after every reconnect: nothing old is announced.
    if (topic === '*') this.engine.rebaseline();
    this.dirty = true;
  }

  warnOnce(topic, err) {
    this.warned ||= new Set();
    if (this.warned.has(topic)) return;
    this.warned.add(topic);
    this.log(`Skipped a ${topic} message the feed sent in an unexpected shape: ${err.message}`);
  }

  snapshot(at) {
    const { snapshot, events } = this.engine.ingest(normalizeSession(this.state.topics, this.state.segmentAt, at), at);
    const first = !this.live;
    this.live = snapshot;
    this.delay.push('frame', snapshot, at);
    events.forEach((event) => {
      this.delay.push('event', event, at);
      this.log(describeEvent(event));
    });
    if (first) this.log(`Following ${snapshot.session.meetingName} ${snapshot.session.name}`.trim());
    this.onChange();
  }

  setDelay(seconds) {
    this.delay.setDelay(seconds * 1000);
    this.tick();
  }

  tick() {
    const now = this.now();
    if (this.dirty && now - this.lastSnapshotAt >= SNAPSHOT_MS) {
      this.dirty = false;
      this.lastSnapshotAt = now;
      this.snapshot(now);
    }
    const due = this.delay.release(now);
    due.forEach((item) => {
      if (item.kind === 'frame') {
        this.onAirFrame = item.data;
        this.onAir({ kind: 'frame', frame: item.data });
      } else if (item.kind === 'radar') {
        this.onAirRadar = item.data;
        this.onAir({ kind: 'radar', radar: item.data });
      } else if (item.kind === 'event') {
        this.onAir({ kind: 'event', event: item.data });
      } else if (item.kind === 'tables') {
        this.tables = { ...this.tables, ...item.data };
        this.onAir({ kind: 'tables', tables: item.data });
      }
    });
    if (due.some((item) => item.kind === 'frame')) this.onChange();
  }

  currentFrame() {
    return this.onAirFrame;
  }
}

function describeEvent(e) {
  switch (e.type) {
    case 'track_status': return `Track: ${e.status.toUpperCase()} (was ${e.from})`;
    case 'session_status': return `Session: ${e.status}`;
    default: return e.type;
  }
}

module.exports = { Feed, describeEvent };
