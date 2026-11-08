// The optional F1 TV token. It lives only in data/secrets.json and in memory, goes
// only to the F1 feed, and the control room only ever learns whether it is set.

const fs = require('fs');
const path = require('path');

// F1 TV access tokens are JWTs; the expiry is read from the payload when it parses.
function readExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

class Secrets {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'secrets.json');
    this.value = { f1tvToken: null, f1tvTokenExpiresAt: null };
    try { this.value = { ...this.value, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { /* first run */ }
  }

  setF1tvToken(token) {
    const clean = String(token ?? '').trim();
    if (clean.length > 8192 || /\s/.test(clean)) throw new Error('That does not look like an F1 TV token');
    this.value = { f1tvToken: clean || null, f1tvTokenExpiresAt: clean ? readExpiry(clean) : null };
    fs.writeFileSync(this.file, JSON.stringify(this.value, null, 2), { mode: 0o600 });
  }

  f1tvToken(now = Date.now()) {
    const { f1tvToken, f1tvTokenExpiresAt } = this.value;
    if (!f1tvToken) return null;
    if (f1tvTokenExpiresAt && f1tvTokenExpiresAt <= now) return null;
    return f1tvToken;
  }

  // The only view of the token that may leave this module.
  publicView(now = Date.now()) {
    const { f1tvToken, f1tvTokenExpiresAt } = this.value;
    return {
      present: Boolean(f1tvToken),
      expiresAt: f1tvTokenExpiresAt,
      expired: Boolean(f1tvToken && f1tvTokenExpiresAt && f1tvTokenExpiresAt <= now),
    };
  }

  redact(text) {
    const token = this.value.f1tvToken;
    return token ? String(text).split(token).join('[F1 TV token]') : String(text);
  }
}

module.exports = { Secrets, readExpiry };
