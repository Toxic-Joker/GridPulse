// Turns the merged F1 state into one clean SessionSnapshot. Pure. This is the
// only place besides state.js that knows raw topic shapes.

// TODO(feed layer): map SessionInfo.Type/Name to SessionType (race, sprint, qualifying, sprint_qualifying, practice).
// TODO(feed layer): TrackStatus codes → green/yellow/sc/vsc/vsc_ending/red.
// TODO(feed layer): DriverList + TimingData + TimingAppData → DriverRow[], sorted by position; never assume 20 cars.
// TODO(feed layer): ExtrapolatedClock → clock; LapCount → laps; RaceControlMessages → last 50.

/** @returns {import('./types').SessionSnapshot} */
function normalizeSession(topics, at) {
  throw new Error('normalizeSession is not built yet');
}

module.exports = { normalizeSession };
