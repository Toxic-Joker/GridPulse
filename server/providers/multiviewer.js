// Circuit outlines and corner numbers from the MultiViewer API, cached forever
// per circuit key and year. The circuit key is the same one the F1 feed uses.

const BASE_URL = 'https://api.multiviewer.app/api/v1/circuits/';

// TODO(radar): circuit(key, year) → raw payload via cache.js, then domain/track.js builds the Circuit.
//   Fallback when it fails: an outline from one lap of archive positions.

module.exports = { BASE_URL };
