// The anti-spoiler buffer. A stream reaches viewers 20-60 seconds after the match
// happened, so every piece of match data waits here until it matches the broadcast.

// Events released this late belong to a moment viewers have already passed.
const STALE_EVENT_MS = 15000;
// At the longest delay the queue holds a few thousand frames. Past this cap the
// oldest frames go first; events are never dropped for space.
const MAX_ITEMS = 5000;

class DelayLine {
  constructor(delayMs = 0, maxItems = MAX_ITEMS) {
    this.delayMs = delayMs;
    this.maxItems = maxItems;
    this.queue = [];
  }

  push(kind, data, at) {
    this.queue.push({ kind, data, at });
    if (this.queue.length > this.maxItems) {
      const oldestFrame = this.queue.findIndex((item) => item.kind !== 'event');
      if (oldestFrame !== -1) this.queue.splice(oldestFrame, 1);
    }
  }

  setDelay(delayMs) {
    this.delayMs = delayMs;
  }

  // Everything now due, oldest first. Lowering the delay can release a backlog:
  // the latest data still goes out, but celebrations that are long past do not.
  release(now) {
    const due = [];
    while (this.queue.length && this.queue[0].at + this.delayMs <= now) {
      const item = this.queue.shift();
      if (item.kind === 'event' && now - (item.at + this.delayMs) > STALE_EVENT_MS) continue;
      due.push(item);
    }
    return due;
  }

  get pending() {
    return this.queue.length;
  }
}

module.exports = { DelayLine, STALE_EVENT_MS, MAX_ITEMS };
