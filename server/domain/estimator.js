// Estimated car positions when no real positions are available (live, no F1 TV token).
// Each car moves on from its last completed mini-sector at its recent pace, never past
// the next mini-sector timing hasn't confirmed, and never ahead of a car above it in
// the tower on the same lap. Labelled "Estimated positions" on air.

// TODO(radar): estimate(snapshot, circuit, at) → RadarFrame with mode 'estimated'.
//   Mini-sector boundaries start evenly spaced (decision D11).

module.exports = {};
