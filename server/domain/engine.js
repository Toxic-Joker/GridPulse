// Compares successive session snapshots and works out what just happened.
// The first snapshot, and the first after every reconnect, is a baseline:
// joining on lap 40 must not replay 40 laps of moments on air.

const race = require('./detectors/race');
const qualifying = require('./detectors/qualifying');

// Race and sprint share their moments; qualifying, sprint qualifying and practice share theirs.
const DETECTORS = { race, sprint: race, qualifying, sprint_qualifying: qualifying, practice: qualifying };

class SessionEngine {
  constructor() {
    this.prev = null;
    this.memory = {};
  }

  rebaseline() {
    this.prev = null;
  }

  /**
   * @param {import('./types').SessionSnapshot} snapshot
   * @param {number} at  When the snapshot was taken (domain code never reads the clock).
   * @returns {{ snapshot: import('./types').SessionSnapshot, events: import('./types').RaceEvent[] }}
   */
  ingest(snapshot, at) {
    const detector = DETECTORS[snapshot.session.type];
    let events = [];
    if (this.prev) {
      events = commonEvents(this.prev, snapshot, at);
      if (detector) events = events.concat(detector.detect(this.prev, snapshot, this.memory));
    } else if (detector) {
      detector.baseline(snapshot, this.memory);
    }
    this.prev = snapshot;
    return { snapshot, events };
  }
}

function commonEvents(prev, s, at) {
  const out = [];
  if (prev.track.status !== s.track.status) {
    out.push({ type: 'track_status', key: `track-${s.track.status}-${s.track.since}`, at: s.track.since, status: s.track.status, from: prev.track.status });
  }
  if (prev.status !== s.status) {
    out.push({ type: 'session_status', key: `status-${s.status}-${s.session.key}`, at, status: s.status, from: prev.status });
  }
  return out;
}

module.exports = { SessionEngine };
