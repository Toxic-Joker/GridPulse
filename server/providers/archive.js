// F1's static archive of finished sessions. Since about 15 October 2026 every file
// needs an F1 TV login (FastF1 #978, undercut-f1 #252; confirmed 401 on 2026-11-08), so
// archive imports are an F1 TV feature. Free rehearsals use recordings (recordings.js).

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

// TODO(archive import, F1 TV): download a session's .jsonStream files with the token cookie
//   and convert them into the recording format, so replay.js plays them like any recording.

module.exports = { isArchivePath, archiveUrl, BASE_URL };
