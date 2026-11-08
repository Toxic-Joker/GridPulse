// F1's static archive: lists finished sessions, downloads them to data/replays/,
// and replays them as FeedMessages on a replay clock. Rehearsal runs through
// exactly the same pipeline as a live session.

// Archive paths look like "2026/2026-11-08_São_Paulo_Grand_Prix/2026-11-08_Race/".
const PATH_PATTERN = /^\d{4}\/\d{4}-\d{2}-\d{2}_[^/]+\/\d{4}-\d{2}-\d{2}_[^/]+\/$/;
const BASE_URL = 'https://livetiming.formula1.com/static/';

function isArchivePath(path) {
  return typeof path === 'string' && path.length < 200 && PATH_PATTERN.test(path) && !path.includes('..');
}

function archiveUrl(path, file) {
  if (!isArchivePath(path)) throw new Error('Not a valid archive path');
  return BASE_URL + path.split('/').map(encodeURIComponent).join('/') + file;
}

// TODO(spike 2): list(season) — merge the year index (may answer 401), calendar-derived paths
//   checked against SessionInfo.json, and data/sessions.json recorded from live sessions.
// TODO(feed layer): download(path) — every topic's .jsonStream into data/replays/<hash>/, 50 MB cap.
// TODO(feed layer): replay with setSpeed(1|5|20), emitting FeedMessages in time order.

class ArchiveProvider {
  constructor({ dataDir, log = () => {} } = {}) {
    this.dataDir = dataDir;
    this.log = log;
    this.speed = 1;
    this.status = { state: 'idle', message: 'Choose a session to replay' };
  }

  async start(onMessage) {
    this.status = { state: 'error', message: 'Replay is not built yet' };
  }

  stop() {
    this.status = { state: 'idle', message: 'Choose a session to replay' };
  }

  setSpeed(speed) {
    this.speed = speed;
  }
}

module.exports = { ArchiveProvider, isArchivePath, archiveUrl, BASE_URL };
