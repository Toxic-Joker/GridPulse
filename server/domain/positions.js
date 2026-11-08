// Real car positions (F1 TV live, or a recording that has them) → RadarFrame. Pure.

// Positions older than this are not trusted: the radar falls back to estimated.
const STALE_MS = 10000;

/**
 * @param {object|null} position  TimingState.topics.Position: { Timestamp, Entries: { number: { Status, X, Y, Z } } }
 * @param {number|null} positionAt When that sample arrived (wall clock).
 * @returns {import('./types').RadarFrame|null} null when there is nothing fresh to show.
 */
function toRadarFrame(position, positionAt, snapshot, at, mode = 'live') {
  if (!position?.Entries || positionAt === null || at - positionAt > STALE_MS) return null;
  const cars = snapshot.drivers.map((d) => {
    const e = position.Entries[d.number];
    const onTrack = e && e.Status === 'OnTrack' && !(e.X === 0 && e.Y === 0);
    return {
      number: d.number, code: d.code, colour: d.teamColour,
      inPit: d.inPit, retired: d.retired || d.stopped,
      lap: null, x: onTrack ? e.X : null, y: onTrack ? e.Y : null,
    };
  });
  return { mode, at, cars };
}

module.exports = { toRadarFrame, STALE_MS };
