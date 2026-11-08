// Follows one session: a provider's raw messages → state → snapshot → engine →
// delay line → on air. Snapshots and radar frames are throttled on the wall clock.

const { DelayLine } = require('./domain/delayLine');

const TICK_MS = 250;

// TODO(feed layer): follow(source, path) wires provider → TimingState → normalizeSession (4 Hz)
//   → SessionEngine → delay line; reconnect re-baselines the engine.
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
    this.live = null;
    this.onAirFrame = null;
    this.onAirRadar = null;
    this.tables = { standings: null, calendar: null };
    this.status = { state: 'idle', message: 'Choose a session to follow' };
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.ticker.unref?.();
  }

  stop() {
    clearInterval(this.ticker);
    this.provider?.stop();
  }

  follow(source) {
    const provider = this.providers[source];
    if (!provider) throw new Error(`Unknown data source: ${source}`);
    this.provider?.stop();
    this.provider = provider;
    this.live = null;
    this.onAirFrame = null;
    this.onAirRadar = null;
    // A new session must not inherit what was waiting for the old one.
    this.delay = new DelayLine(this.getShow().delaySeconds * 1000);
    this.onAir({ kind: 'reset' });
    this.status = { state: 'idle', message: source === 'live' ? 'Live feed is not built yet' : 'Replay is not built yet' };
    this.onChange();
  }

  setDelay(seconds) {
    this.delay.setDelay(seconds * 1000);
    this.tick();
  }

  tick() {
    const due = this.delay.release(this.now());
    due.forEach((item) => {
      if (item.kind === 'frame') {
        this.onAirFrame = item.data;
        this.onAir({ kind: 'frame', frame: item.data });
        this.onChange();
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
  }

  currentFrame() {
    return this.onAirFrame;
  }
}

module.exports = { Feed };
