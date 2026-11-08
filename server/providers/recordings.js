// Recordings of sessions, as JSON lines in data/recordings/. Every live session GridPulse
// follows is recorded, so it can be replayed later as a rehearsal. F1's own archive needs
// an F1 TV login since October 2026; this is the free way to get real replays.
//
// Line format: {"kind":"state","at":ms,"data":{...full state}} (first line, and after a reconnect)
//              {"kind":"msg","at":ms,"topic":"TimingData","data":{...},"utc":"..."}

const fs = require('fs');
const path = require('path');

const FILE_PATTERN = /^[A-Za-z0-9_-]{1,80}\.jsonl$/;
const HEAD_BYTES = 2 * 1024 * 1024;

function isRecordingId(id) {
  return typeof id === 'string' && FILE_PATTERN.test(id);
}

function recordingPath(dir, id) {
  if (!isRecordingId(id)) throw new Error('Not a valid recording');
  return path.join(dir, id);
}

class Recorder {
  constructor(dir) {
    this.dir = dir;
    this.stream = null;
    this.id = null;
  }

  // A new file per connection; the first line is the full state.
  begin(state, at) {
    this.end();
    fs.mkdirSync(this.dir, { recursive: true });
    const key = state?.SessionInfo?.Key ?? 'unknown';
    this.id = `${new Date(at).toISOString().slice(0, 19).replace(/[:T]/g, '-')}_${key}.jsonl`;
    this.stream = fs.createWriteStream(path.join(this.dir, this.id), { flags: 'a' });
    this.write({ kind: 'state', at, data: state });
  }

  state(state, at) {
    if (!this.stream) return this.begin(state, at);
    return this.write({ kind: 'state', at, data: state });
  }

  message(topic, data, utc, at) {
    this.write({ kind: 'msg', at, topic, data, utc });
  }

  write(line) {
    this.stream?.write(`${JSON.stringify(line)}\n`);
  }

  end() {
    this.stream?.end();
    this.stream = null;
  }
}

// Session details from the first line, without reading a whole race into memory.
function readInfo(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const bytes = fs.readSync(fd, buffer, 0, HEAD_BYTES, 0);
    const first = buffer.toString('utf8', 0, bytes).split('\n')[0];
    const line = JSON.parse(first);
    const info = line.data?.SessionInfo || {};
    return {
      meetingName: info.Meeting?.Name ?? 'Unknown session',
      name: info.Name ?? '',
      type: info.Type ?? '',
      startDate: info.StartDate ?? null,
      recordedAt: line.at,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function listRecordings(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => FILE_PATTERN.test(f)); } catch { return []; }
  return files.map((id) => {
    const file = path.join(dir, id);
    try {
      return { id, bytes: fs.statSync(file).size, ...readInfo(file) };
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => b.recordedAt - a.recordedAt);
}

// A recording still being written (or cut off by a crash) can end in half a line: skip it.
function readRecording(dir, id) {
  const lines = [];
  fs.readFileSync(recordingPath(dir, id), 'utf8').split('\n').forEach((text) => {
    if (!text) return;
    try { lines.push(JSON.parse(text)); } catch { /* partial line */ }
  });
  return lines;
}

module.exports = { Recorder, listRecordings, readRecording, isRecordingId, recordingPath };
