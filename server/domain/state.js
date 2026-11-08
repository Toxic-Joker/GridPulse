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

function segmentsTouched(line) {
  return isObject(line?.Sectors) && Object.values(line.Sectors).some((s) => s && s.Segments !== undefined);
}

class TimingState {
  constructor() {
    this.topics = {};
    // When each car last completed a mini-sector (for the estimated radar), by racing number.
    this.segmentAt = {};
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
      Object.entries(data || {}).forEach(([t, d]) => this.apply({ topic: t, data: d, at }));
      return;
    }
    const name = topic.endsWith('.z') ? topic.slice(0, -2) : topic;
    const payload = topic.endsWith('.z') ? decodeZ(data) : data;
    if (name === 'Position' || name === 'CarData') {
      const sample = latestSample(name, payload);
      if (sample) this.topics[name] = sample;
      return;
    }
    if (name === 'TimingData' && isObject(payload?.Lines)) {
      Object.entries(payload.Lines).forEach(([number, line]) => {
        if (segmentsTouched(line)) this.segmentAt[number] = at;
      });
    }
    this.topics[name] = mergePatch(this.topics[name], payload);
  }
}

module.exports = { TimingState, mergePatch, decodeZ };
