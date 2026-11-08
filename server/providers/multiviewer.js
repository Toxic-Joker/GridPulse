// Circuit outlines and corner numbers from the MultiViewer API, cached forever per
// circuit key and year. The circuit key is the same one the F1 feed uses. The rehearsal's
// fictional circuit is built in, so it never touches the network.

const path = require('path');
const { FileCache } = require('./cache');
const { rehearsalCircuit } = require('./rehearsal');

const BASE_URL = 'https://api.multiviewer.app/api/v1/circuits/';
const TIMEOUT_MS = 10000;
const MAX_BYTES = 2 * 1024 * 1024;
const REHEARSAL_KEY = 9001;

async function fetchJson(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { 'User-Agent': 'GridPulse' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Circuit data is too large');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

class MultiViewerProvider {
  constructor({ dataDir, fetchImpl = globalThis.fetch }) {
    this.cache = new FileCache(path.join(dataDir, 'cache'));
    this.fetchImpl = fetchImpl;
  }

  // The raw outline for a circuit, trying this year and then earlier ones (layouts rarely change).
  async circuit(key, year) {
    if (Number(key) === REHEARSAL_KEY) return rehearsalCircuit();
    if (!Number.isInteger(Number(key)) || !Number.isInteger(Number(year))) throw new Error('Unknown circuit');
    let lastError = null;
    for (const y of [year, year - 1, year - 2]) {
      const cacheKey = `multiviewer:circuit:${key}:${y}`;
      const cached = this.cache.get(cacheKey, Infinity);
      if (cached) return cached;
      try {
        const data = await fetchJson(`${BASE_URL}${Number(key)}/${y}`, this.fetchImpl);
        if (Array.isArray(data?.x) && data.x.length > 2) {
          this.cache.set(cacheKey, data);
          return data;
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`No outline for circuit ${key}: ${lastError?.message ?? 'not found'}`);
  }
}

module.exports = { MultiViewerProvider, BASE_URL, REHEARSAL_KEY };
