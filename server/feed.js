// Follows one session: a provider's raw messages → state → snapshot → engine →
// delay line → on air. Snapshots are throttled on the wall clock, so a 20× replay
// sends OBS no more frames than a live session does.

const { DelayLine } = require('./domain/delayLine');
const { TimingState } = require('./domain/state');
const { normalizeSession } = require('./domain/normalize');
const { SessionEngine } = require('./domain/engine');
const { buildCircuit, circuitForOverlay } = require('./domain/track');
const { estimate } = require('./domain/estimator');
const { toRadarFrame } = require('./domain/positions');

const TICK_MS = 250;
const SNAPSHOT_MS = 250;
const OVERTAKE_BANNER_MS = 5000;

// TODO(standings): tables from Jolpica only while a widget on air needs them.
// TODO(live): calendar check every minute; connect 15 min before a session, stay until Finalised or 5 h.

class Feed {
  constructor({ providers, circuits = null, getShow, onAir, onChange, log, now = () => Date.now() }) {
    this.providers = providers;
    this.circuits = circuits;
    this.circuit = null;
    this.circuitKey = null;
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
    this.tables = { standings: null, calendar: null, circuit: null };
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
    this.circuit = null;
    this.circuitKey = null;
    this.tables = { ...this.tables, circuit: null };
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
    this.paceOvertakes(events, at).forEach((event) => {
      this.delay.push('event', event, at);
      if (!event.quiet) this.log(describeEvent(event));
    });
    if (first) this.log(`Following ${snapshot.session.meetingName} ${snapshot.session.name}`.trim());
    this.loadCircuit(snapshot.session);
    const radar = this.radarFrame(snapshot, at);
    if (radar) this.delay.push('radar', radar, at);
    this.onChange();
  }

  // Real positions when fresh ones arrive (F1 TV, or a recording that has them), otherwise estimated.
  radarFrame(snapshot, at) {
    const real = toRadarFrame(this.state.topics.Position, this.state.positionAt, snapshot, at, this.source === 'replay' ? 'replay' : 'live');
    if (real) return real;
    const rate = this.source === 'replay' ? this.provider?.speed || 1 : 1;
    return estimate(snapshot, this.circuit, at, rate);
  }

  // The outline is static, so it goes on air straight away rather than through the delay line.
  loadCircuit(session) {
    const key = session.circuitKey;
    if (!this.circuits || key === null || key === this.circuitKey) return;
    this.circuitKey = key;
    const generation = this.generation;
    this.circuits.circuit(key, session.year || new Date(this.now()).getUTCFullYear())
      .then((payload) => {
        if (generation !== this.generation) return;
        this.circuit = buildCircuit(payload);
        this.tables = { ...this.tables, circuit: circuitForOverlay(this.circuit) };
        this.onAir({ kind: 'tables', tables: { circuit: this.tables.circuit } });
      })
      .catch((err) => {
        if (generation === this.generation) this.log(`No circuit map for this session: ${err.message}`);
      });
  }

  // Overtakes and pit stops come in bursts (a restart, a pit window), so between them they
  // get at most one banner every few seconds; the rest go to the ticker only.
  // Followed drivers and the top 3 win the banner.
  paceOvertakes(events, at) {
    const followed = new Set(this.getShow().followedDrivers || []);
    const position = (e) => e.forPosition ?? e.position ?? 99;
    const rank = (e) => (followed.has(e.code) || followed.has(e.on?.code) ? 0 : position(e) <= 3 ? 1 : 2);
    const minor = events.filter((e) => e.type === 'overtake' || e.type === 'pit').sort((a, b) => rank(a) - rank(b) || position(a) - position(b));
    minor.forEach((e) => {
      if (at - (this.lastMinorBanner ?? -Infinity) >= OVERTAKE_BANNER_MS) {
        this.lastMinorBanner = at;
      } else {
        e.quiet = true;
      }
    });
    return events;
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
    case 'lights_out': return 'Lights out';
    case 'restart': return `Restart on lap ${e.lap}`;
    case 'overtake': return `Overtake: ${e.code} on ${e.on.code} for P${e.forPosition}`;
    case 'new_leader': return `New leader: ${e.code}`;
    case 'pit': return `Pit stop: ${e.code} (stop ${e.stop})`;
    case 'fastest_lap': return `Fastest lap: ${e.code} ${e.time}`;
    case 'penalty': return `Penalty: ${e.text}`;
    case 'retirement': return `Retired: ${e.code}`;
    case 'lap1_summary': return `Lap 1: ${e.gains.map((g) => `${g.code} +${g.change}`).join(', ') || 'no gains'}`;
    case 'chequered': return `Chequered flag: ${e.winner?.code ?? ''} wins`;
    default: return e.type;
  }
}

module.exports = { Feed, describeEvent };
