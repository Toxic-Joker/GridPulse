// Keeps the full F1 timing state. The feed sends partial patches: objects keyed
// by index ("Lines": {"1": {...}}), `_deleted` lists, and `.z` topics that are
// base64 + raw deflate. This module merges them into one state. Pure, except
// that decoding uses Node's zlib.

// TODO(feed layer): mergePatch(target, patch) — deep merge, arrays patched by index keys, `_deleted` honoured.
// TODO(feed layer): decodeZ(base64) — zlib.inflateRawSync → JSON.
// TODO(feed layer): TimingState.apply(FeedMessage) for each topic listed in ARCHITECTURE.md.

class TimingState {
  constructor() {
    this.topics = {};
  }

  /** @param {import('./types').FeedMessage} message */
  apply(message) {
    throw new Error(`TimingState.apply is not built yet (topic ${message.topic})`);
  }
}

module.exports = { TimingState };
