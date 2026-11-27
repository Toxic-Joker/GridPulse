// Keeps the full F1 timing state. The feed sends partial patches: objects keyed
// by index ("Lines": {"1": {...}}, "Segments": {"3": {...}}), `_deleted` lists,
// `_kf` keyframe markers, and `.z` topics that are base64 + raw deflate. This module
// merges them into one state. Pure, except that decoding uses Node's zlib.

const zlib = require('zlib');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIndexKey = (k) => /^\d+$/.test(k);

// Merges a patch into a target and returns the result. Arrays in the target are
// patched by index when the patch is an object of index keys ({"2": {...}}), which is
// how the feed updates sectors, segments, stints and race control messages.
function mergePatch(target, patch) {
  if (Array.isArray(patch)) return patch.map((v) => mergePatch(undefined, v));
  if (!isObject(patch)) return patch;

  if (Array.isArray(target) && Object.keys(patch).every((k) => isIndexKey(k) || k === '_deleted' || k === '_kf')) {
    const out = target.slice();
    Object.entries(patch).forEach(([k, v]) => {
      if (isIndexKey(k)) out[Number(k)] = mergePatch(out[Number(k)], v);
    });
    if (Array.isArray(patch._deleted)) patch._deleted.map(Number).sort((a, b) => b - a).forEach((i) => out.splice(i, 1));
    return out;
  }

  const out = isObject(target) ? { ...target } : {};
  Object.entries(patch).forEach(([k, v]) => {
    if (k === '_kf' || k === '_deleted') return;
    out[k] = mergePatch(out[k], v);
  });
  if (Array.isArray(patch._deleted)) patch._deleted.forEach((k) => { delete out[String(k)]; });
  return out;
}

function decodeZ(data) {
  if (typeof data !== 'string') return data;
  return JSON.parse(zlib.inflateRawSync(Buffer.from(data, 'base64')).toString('utf8'));
}

// Topics whose payloads are a series of samples: only the latest sample matters here.
function latestSample(topic, data) {
  if (topic === 'Position') {
    const series = data?.Position;
    return Array.isArray(series) && series.length ? series[series.length - 1] : null;
  }
  if (topic === 'CarData') {
    const series = data?.Entries;
    return Array.isArray(series) && series.length ? series[series.length - 1] : null;
  }
  return data;
}

// True when this patch reports the last mini-sector of the lap: the car has crossed the line.
// The feed also clears every segment to Status 0 when a lap starts; that is not a crossing.
function lapCompleted(line, merged) {
  const sectors = merged?.Sectors;
  if (!isObject(line?.Sectors) || !Array.isArray(sectors) || !sectors.length) return false;
  const last = sectors.length - 1;
  const segments = sectors[last]?.Segments;
  const patch = line.Sectors[last]?.Segments;
  return Array.isArray(segments) && isObject(patch) && Boolean(patch[segments.length - 1]?.Status);
}

function segmentsTouched(line) {
  return isObject(line?.Sectors) && Object.values(line.Sectors).some((s) => s && s.Segments !== undefined);
}

// How many mini-sectors of the lap the car has completed: the last one with a status, as normalize counts them.
function segmentsDone(line) {
  let count = 0;
  let done = 0;
  // Merged state keeps sectors and mini-sectors as arrays; patches send them as keyed objects.
  const list = (v) => (v && typeof v === 'object' ? Object.values(v) : []);
  list(line?.Sectors).forEach((s) => {
    list(s?.Segments).forEach((seg) => {
      count += 1;
      if (seg && seg.Status) done = count;
    });
  });
  return done;
}

class TimingState {
  constructor() {
    this.topics = {};
    // When each car last completed a mini-sector (for the estimated radar), by racing number.
    this.segmentAt = {};
    // When the last real position sample arrived (F1 TV), so stale positions are not shown.
    this.positionAt = null;
    // When the session clock last arrived, so it can count down from there.
    this.clockAt = null;
    // Cars on an out lap, by racing number. The feed's PitOut only lasts until the end of the
    // first sector (seen at Las Vegas FP1, Nov 2026), so the out lap is kept here until the car
    // crosses the line or goes back in.
    this.outLap = {};
  }

  /**
   * Applies one FeedMessage. Topic "*" carries the full state (a Subscribe reply), which
   * replaces everything; other topics are patches. Unknown topics are kept but unused.
   * @param {import('./types').FeedMessage} message
   */
  apply({ topic, data, at }) {
    if (topic === '*') {
      this.topics = {};
      this.segmentAt = {};
      this.clockAt = null;
      this.outLap = {};
      Object.entries(data || {}).forEach(([t, d]) => this.apply({ topic: t, data: d, at }));
      return;
    }
    const name = topic.endsWith('.z') ? topic.slice(0, -2) : topic;
    const payload = topic.endsWith('.z') ? decodeZ(data) : data;
    if (name === 'Position' || name === 'CarData') {
      const sample = latestSample(name, payload);
      if (sample) {
        this.topics[name] = sample;
        if (name === 'Position') this.positionAt = at;
      }
      return;
    }
    // The feed also re-sends and recolours mini-sectors a car has already passed. Only a change in
    // how many are done restarts the clock, or the estimated radar throws the car back to the
    // start of its mini-sector (seen at Las Vegas, Nov 2026).
    const touched = name === 'TimingData' && isObject(payload?.Lines)
      ? Object.entries(payload.Lines).filter(([, line]) => segmentsTouched(line)).map(([number]) => [number, segmentsDone(this.topics.TimingData?.Lines?.[number])])
      : [];
    if (name === 'ExtrapolatedClock') this.clockAt = at;
    this.topics[name] = mergePatch(this.topics[name], payload);
    touched.forEach(([number, before]) => {
      if (segmentsDone(this.topics.TimingData.Lines[number]) !== before || this.segmentAt[number] === undefined) this.segmentAt[number] = at;
    });
    if (name === 'TimingData' && isObject(payload?.Lines)) this.trackOutLaps(payload.Lines);
  }

  trackOutLaps(lines) {
    Object.entries(lines).forEach(([number, line]) => {
      if (!isObject(line)) return;
      const merged = this.topics.TimingData?.Lines?.[number];
      if (line.InPit === true || lapCompleted(line, merged)) delete this.outLap[number];
      if (line.PitOut === true) this.outLap[number] = true;
    });
  }
}

module.exports = { TimingState, mergePatch, decodeZ };
