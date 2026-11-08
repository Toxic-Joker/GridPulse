// Circuit geometry: an outline as a closed polyline, distance along it, and the point
// at a fraction of a lap. Pure. Coordinates are whatever the source uses (MultiViewer:
// decimetres); everything else works in fractions of a lap, so units never leak out.

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Builds a Circuit from a MultiViewer-shaped payload: { circuitKey, year, rotation, x[], y[], corners[] }.
 * Each corner's `length` is its distance from the start line, which tells us where lap distance 0 is.
 * @returns {import('./types').Circuit & { startOffset: number }}
 */
function buildCircuit(payload) {
  const xs = payload?.x || [];
  const ys = payload?.y || [];
  if (xs.length < 3 || xs.length !== ys.length) throw new Error('Circuit outline is missing or malformed');
  const outline = xs.map((x, i) => [Number(x), Number(ys[i])]);
  const distance = [0];
  for (let i = 1; i < outline.length; i += 1) distance.push(distance[i - 1] + dist(outline[i - 1], outline[i]));
  const length = distance.at(-1) + dist(outline.at(-1), outline[0]);
  const circuit = {
    key: payload.circuitKey ?? null,
    year: payload.year ?? null,
    rotation: Number(payload.rotation) || 0,
    outline,
    distance,
    lengthM: length,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    corners: [],
    startOffset: 0,
  };
  const corners = (payload.corners || []).filter((c) => Number.isFinite(c?.trackPosition?.x) && Number.isFinite(c?.trackPosition?.y));
  circuit.corners = corners.map((c) => ({ number: c.number, x: c.trackPosition.x, y: c.trackPosition.y }));
  // Where the start line sits on the outline: the median of (corner's place on the outline − its distance from the line).
  const offsets = corners.filter((c) => Number.isFinite(c.length))
    .map((c) => mod(nearestDistance(circuit, c.trackPosition.x, c.trackPosition.y) - c.length, length))
    .sort((a, b) => a - b);
  if (offsets.length) circuit.startOffset = offsets[Math.floor(offsets.length / 2)];
  return circuit;
}

// Distance along the outline (from its first point) of the point closest to (x, y).
function nearestDistance(circuit, x, y) {
  const { outline, distance } = circuit;
  let best = { d2: Infinity, at: 0 };
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < best.d2) best = { d2, at: distance[i] + t * Math.sqrt(len2) };
  }
  return best.at;
}

// The point a given fraction of the way round the lap, measured from the start line.
function pointAtLap(circuit, fraction) {
  const { outline, distance, lengthM, startOffset } = circuit;
  const target = mod(startOffset + mod(fraction, 1) * lengthM, lengthM);
  let lo = 0;
  let hi = outline.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (distance[mid] <= target) lo = mid; else hi = mid - 1;
  }
  const a = outline[lo];
  const b = outline[(lo + 1) % outline.length];
  const segLen = (lo + 1 < outline.length ? distance[lo + 1] : lengthM) - distance[lo] || 1;
  const t = (target - distance[lo]) / segLen;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Fraction of the lap at (x, y), measured from the start line.
function lapFractionAt(circuit, x, y) {
  return mod(nearestDistance(circuit, x, y) - circuit.startOffset, circuit.lengthM) / circuit.lengthM;
}

// What the overlay needs to draw: no distance tables, coordinates rounded.
function circuitForOverlay(circuit) {
  return {
    key: circuit.key,
    rotation: circuit.rotation,
    outline: circuit.outline.map(([x, y]) => [Math.round(x), Math.round(y)]),
    corners: circuit.corners.map((c) => ({ number: c.number, x: Math.round(c.x), y: Math.round(c.y) })),
    bounds: circuit.bounds,
    start: pointAtLap(circuit, 0).map(Math.round),
  };
}

module.exports = { buildCircuit, nearestDistance, pointAtLap, lapFractionAt, circuitForOverlay };
