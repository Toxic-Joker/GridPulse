// Live F1 timing over SignalR Core (@microsoft/signalr). Emits raw FeedMessages;
// knows nothing about what they mean. The F1 TV token, when present, goes only
// into the connection's cookie header.

// TODO(spike 1): confirm the hub URL and that an anonymous connection still works.
// TODO(feed layer): subscribe to SessionInfo, SessionStatus, TrackStatus, LapCount, ExtrapolatedClock,
//   DriverList, TimingData, TimingAppData, TimingStats, RaceControlMessages, WeatherData,
//   and with a token Position.z and CarData.z. The Subscribe reply is the full state: emit it first.
// TODO(feed layer): reconnect with backoff 2 s → 60 s, reset after 5 min connected.

class F1LiveProvider {
  constructor({ getToken = () => null, log = () => {} } = {}) {
    this.getToken = getToken;
    this.log = log;
    this.status = { state: 'idle', message: 'Not connected' };
  }

  async start(onMessage) {
    this.status = { state: 'error', message: 'Live feed is not built yet' };
  }

  stop() {
    this.status = { state: 'idle', message: 'Not connected' };
  }
}

module.exports = { F1LiveProvider };
