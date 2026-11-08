// File cache for JSON from free APIs, under data/cache/. Keys are hashed into file
// names so nothing from a URL ever becomes a path.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileCache {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  file(key) {
    return path.join(this.dir, `${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}.json`);
  }

  // A fresh entry, or null. ttlMs = Infinity keeps it forever.
  get(key, ttlMs, now = Date.now()) {
    try {
      const entry = JSON.parse(fs.readFileSync(this.file(key), 'utf8'));
      return now - entry.at <= ttlMs ? entry.data : null;
    } catch {
      return null;
    }
  }

  set(key, data, now = Date.now()) {
    fs.writeFileSync(this.file(key), JSON.stringify({ at: now, data }));
  }
}

// TODO(standings): fetchJson(url, { timeoutMs: 10000, maxBytes }) with a serial queue per host.

module.exports = { FileCache };
