// When to be connected to the live feed: from 15 minutes before a session until it is
// finalised, or 5 hours after its scheduled start (delays and red flags). Pure.

const BEFORE_MS = 15 * 60000;
const AFTER_MS = 5 * 3600e3;
const SAME_SESSION_MS = 30 * 60000;

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

// Whether the feed's session (its start time from SessionInfo) is the calendar's due session.
// Back-to-back sessions (FP1 and FP2, FP3 and qualifying) sit inside each other's windows, and
// the feed keeps the old session for a while after it ends.
function isSessionFor(due, startsAt) {
  const at = Date.parse(startsAt || '');
  return Boolean(due) && Number.isFinite(at) && Math.abs(at - due.at) <= SAME_SESSION_MS;
}

/**
 * What the calendar check should do now.
 * 'follow': connect for the due session (also when live on the session before it, so the new
 *   session gets its own recording and baseline, or live on it without recording it: the feed
 *   can show the new session while still saying the old one is Finalised, and the recorder
 *   skips a finished session). 'adopt': already live on the due session and recording it.
 * 'close': the window has passed. null: nothing.
 */
function scheduleAction({ due, key, autoStarted, autoLive, source, liveStartsAt, recording = true }) {
  const liveOnIt = source === 'live' && isSessionFor(due, liveStartsAt);
  if (due && liveOnIt) {
    if (key === autoStarted) return null;
    return recording || !autoLive ? 'adopt' : 'follow';
  }
  if (due && autoLive && key !== autoStarted) return 'follow';
  if (!due && autoStarted && source === 'live') return 'close';
  return null;
}

module.exports = { dueSession, nextSession, isSessionFor, scheduleAction, BEFORE_MS, AFTER_MS };
