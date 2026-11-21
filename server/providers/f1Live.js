// Live F1 timing over SignalR Core (@microsoft/signalr). Emits raw FeedMessages and
// records every session to data/recordings/ for later replay; knows nothing about what
// the messages mean. The F1 TV token, when present, goes only into the cookie header.
//
// Spike 1 (2026-11-08): an anonymous connection works. Position.z, CarData.z and
// ChampionshipPrediction only arrive with an F1 TV token.

const path = require('path');
const { Recorder } = require('./recordings');

const HUB_URL = 'https://livetiming.formula1.com/signalrcore';
const TOPICS = ['Heartbeat', 'SessionInfo', 'SessionStatus', 'SessionData', 'TrackStatus', 'LapCount', 'ExtrapolatedClock',
  'DriverList', 'TimingData', 'TimingAppData', 'TimingStats', 'RaceControlMessages', 'WeatherData',
  'TopThree', 'TyreStintSeries', 'PitLaneTimeCollection', 'Position.z', 'CarData.z'];
const RECONNECT_DELAYS = [0, 2000, 5000, 10000, 30000, 60000, 60000, 60000];

class F1LiveProvider {
  constructor({ dataDir, getToken = () => null, log = () => {}, signalR = null }) {
    this.getToken = getToken;
    this.log = log;
    this.signalR = signalR;
    this.recorder = dataDir ? new Recorder(path.join(dataDir, 'recordings')) : null;
    this.connection = null;
    this.status = { state: 'idle', message: 'Not connected' };
  }

  async start(onMessage) {
    await this.stop();
    const signalR = this.signalR || require('@microsoft/signalr');
    const token = this.getToken();
    const options = token ? { headers: { Cookie: `formula1AccessToken=${token}` } } : {};
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, options)
      .withAutomaticReconnect(RECONNECT_DELAYS)
      .configureLogging(signalR.LogLevel.None)
      .build();
    this.connection = connection;

    const subscribe = async () => {
      const state = await connection.invoke('Subscribe', TOPICS);
      const at = Date.now();
      // A session that is already over has nothing new to record.
      const over = ['Finalised', 'Ends'].includes(state?.SessionStatus?.Status);
      if (!over) this.recorder?.state(state, at);
      // The Subscribe reply is the full current state: the engine treats it as a baseline.
      onMessage({ topic: '*', data: state });
      this.status = { state: 'live', message: `Connected to ${state?.SessionInfo?.Meeting?.Name ?? 'the live feed'}${token ? ' with F1 TV' : ''}` };
    };

    connection.on('feed', (topic, data, utc) => {
      this.recorder?.message(topic, data, utc, Date.now());
      onMessage({ topic, data });
    });
    connection.onreconnecting(() => { this.status = { state: 'stale', message: 'Live feed dropped, reconnecting' }; });
    connection.onreconnected(() => subscribe().catch((err) => this.log(`Live feed: ${err.message}`)));
    connection.onclose(() => { if (this.connection === connection) this.status = { state: 'error', message: 'Live feed closed' }; });

    this.status = { state: 'connecting', message: 'Connecting to the live feed' };
    try {
      await connection.start();
      await subscribe();
      if (this.recorder?.id) this.log(`Recording this session to data/recordings/${this.recorder.id}`);
    } catch (err) {
      this.status = { state: 'error', message: `Could not connect to the live feed: ${err.message}` };
    }
  }

  // Whether this connection is writing a recording (it skips a session that was already over).
  get recording() {
    return Boolean(this.recorder?.id);
  }

  async stop() {
    const connection = this.connection;
    this.connection = null;
    this.recorder?.end();
    if (connection) await connection.stop().catch(() => {});
    this.status = { state: 'idle', message: 'Not connected' };
  }
}

module.exports = { F1LiveProvider, TOPICS, HUB_URL };
