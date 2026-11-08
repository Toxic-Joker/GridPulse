// When to be connected to the live feed: from 15 minutes before a session until it is
// finalised, or 5 hours after its scheduled start (delays and red flags). Pure.

const BEFORE_MS = 15 * 60000;
const AFTER_MS = 5 * 3600e3;

function sessionsOf(calendar) {
  return (calendar?.rounds || []).flatMap((r) => r.sessions.map((s) => ({ ...s, round: r.round, meeting: r.name, at: Date.parse(s.startsAt) })))
    .filter((s) => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at);
}

// The session we should be connected for right now, or null.
function dueSession(calendar, now) {
  return sessionsOf(calendar).filter((s) => now >= s.at - BEFORE_MS && now <= s.at + AFTER_MS).at(-1) ?? null;
}

function nextSession(calendar, now) {
  return sessionsOf(calendar).find((s) => s.at > now) ?? null;
}

module.exports = { dueSession, nextSession, BEFORE_MS, AFTER_MS };
