// Wires the HTTP routes, the two Socket.IO channels and the feed together.
// Overlays may only read. Only the control channel, with its own token, can change anything.
// From MatchRoom; the F1 TV token is the one new secret and never leaves the server.

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const { Server } = require('socket.io');

const { WIDGETS, THEMES, LANGS, DISPLAY, SOCIAL_PLATFORMS, REPLAY_SPEEDS, MAX_DELAY, reviveShow, applyAction, themeTokens, ActionError, cleanText } = require('./show');
const { Feed } = require('./feed');
const { Secrets } = require('./secrets');
const { F1LiveProvider } = require('./providers/f1Live');
const { ReplayProvider } = require('./providers/replay');
const { isRecordingId } = require('./providers/recordings');
const { ensureRehearsal } = require('./providers/rehearsal');
const { ensureSessionRehearsals } = require('./providers/rehearsalQualifying');
const { MultiViewerProvider } = require('./providers/multiviewer');
const { JolpicaProvider } = require('./providers/jolpica');
const { dueSession, nextSession } = require('./domain/schedule');

const SCHEDULE_MS = 60000;

const LOG_SIZE = 60;

function sameToken(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function loadTokens(dataDir, env) {
  const file = path.join(dataDir, 'tokens.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  const tokens = {
    control: env.CONTROL_TOKEN || saved.control || crypto.randomBytes(18).toString('base64url'),
    overlay: env.OVERLAY_TOKEN || saved.overlay || crypto.randomBytes(18).toString('base64url'),
  };
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return tokens;
}

function createApp({ env = process.env, dataDir, providers: providersOverride, circuits: circuitsOverride, tables: tablesOverride, schedule = true } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tokens = loadTokens(dataDir, env);
  const secrets = new Secrets(dataDir);
  const showFile = path.join(dataDir, 'show.json');
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(showFile, 'utf8')); } catch { /* first run */ }
  let show = reviveShow(saved);
  const log = [];

  // The fictional rehearsal race is always there, so a first run has something to play.
  const rehearsalId = ensureRehearsal(path.join(dataDir, 'recordings'));
  ensureSessionRehearsals(path.join(dataDir, 'recordings'));
  if (!show.replay.recording) show = { ...show, replay: { ...show.replay, recording: rehearsalId } };

  function addLog(message) {
    log.unshift({ at: Date.now(), message: cleanText(secrets.redact(message), 200) });
    log.length = Math.min(log.length, LOG_SIZE);
  }

  const providers = providersOverride || {
    live: new F1LiveProvider({ dataDir, getToken: () => secrets.f1tvToken(), log: addLog }),
    replay: new ReplayProvider({ dataDir, log: addLog }),
  };
  providers.replay?.setSpeed?.(show.replay.speed);
  if (show.replay.recording) providers.replay?.select?.(show.replay.recording);

  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const io = new Server(server, {
    serveClient: true,
    // Browsers do not apply CORS to WebSockets, so foreign pages are refused here.
    allowRequest: (req, callback) => {
      const { origin, host } = req.headers;
      if (!origin) return callback(null, true);
      try { return callback(null, new URL(origin).host === host); } catch { return callback(null, false); }
    },
  });
  const overlayIo = io.of('/overlay');
  const controlIo = io.of('/control');

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fs.writeFile(showFile, JSON.stringify(show, null, 2), (err) => { if (err) console.error('[show] save failed:', err.message); });
    }, 300);
    saveTimer.unref?.();
  }

  function overlayShow() {
    return {
      widgets: show.widgets,
      lang: show.lang,
      background: show.background,
      cameraGuide: show.cameraGuide,
      socials: show.socials,
      sponsor: show.sponsor,
      countdown: show.countdown,
      followedDrivers: show.followedDrivers,
      theme: themeTokens(show),
    };
  }

  function controlState() {
    return {
      show,
      live: feed.live,
      onAir: feed.onAirFrame,
      status: feed.status,
      pendingOnAir: feed.delay.pending,
      log,
      f1tv: secrets.publicView(),
      next: upcoming,
    };
  }

  let changeTimer = null;
  function publishControl() {
    if (changeTimer) return;
    changeTimer = setTimeout(() => {
      changeTimer = null;
      controlIo.emit('state', controlState());
    }, 100);
    changeTimer.unref?.();
  }

  // How a moment appears on air: full screen, banner, ticker line only, or not at all.
  function presentEvent(event) {
    const rule = show.auto[event.type] ?? 'off';
    if (rule === 'off') return { ...event, display: 'off' };
    // Single waved yellows come and go all race: they belong in the ticker, not a banner.
    const minorFlag = event.type === 'track_status' && (event.status === 'yellow' || (event.status === 'green' && event.from === 'yellow'));
    return { ...event, display: event.quiet || minorFlag ? 'ticker' : rule };
  }

  const tablesSource = tablesOverride || new JolpicaProvider({ dataDir });
  let upcoming = null;
  let autoStarted = null;
  let scheduleTimer = null;

  // Connects to the live feed 15 minutes before a session on the calendar, even mid-rehearsal,
  // and lets go once the session's window has passed. "Follow the live session" still works any time.
  // Inside a session's window the feed may already say it is over (the window is generous for
  // delays). Then let go and put back whatever was playing, rather than sit on a finished session.
  async function autoFollow(due) {
    const before = show.source;
    await feed.follow('live');
    await new Promise((resolve) => { const t = setTimeout(resolve, 1500); t.unref?.(); });
    if (feed.source === 'live' && feed.live?.status === 'ended') {
      addLog(`${due.meeting} ${due.name} has already finished`);
      await providers.live?.stop?.();
      if (before === 'replay' && show.replay.recording) followSource('replay');
      return;
    }
    show = { ...show, source: 'live' };
    addLog(`${due.meeting} ${due.name}: following it live`);
    persist();
  }

  async function checkSchedule() {
    const now = Date.now();
    try {
      const year = new Date(now).getUTCFullYear();
      let calendar = await tablesSource.calendar(year);
      upcoming = nextSession(calendar, now);
      if (!upcoming) {
        calendar = await tablesSource.calendar(year + 1).catch(() => calendar);
        upcoming = nextSession(calendar, now);
      }
      const due = dueSession(calendar, now);
      const key = due ? `${due.round}-${due.type}-${due.at}` : null;
      if (show.autoLive && due && key !== autoStarted && feed.source !== 'live') {
        autoStarted = key;
        await autoFollow(due);
      } else if (!due && autoStarted && feed.source === 'live') {
        autoStarted = null;
        providers.live?.stop?.();
        addLog('The session window has passed: live feed closed');
      }
    } catch (err) {
      addLog(`Could not check the calendar: ${err.message}`);
    }
    publishControl();
  }

  const feed = new Feed({
    providers,
    circuits: circuitsOverride || new MultiViewerProvider({ dataDir }),
    tablesSource,
    getShow: () => show,
    log: addLog,
    onChange: publishControl,
    onAir: (item) => {
      if (item.kind === 'reset') overlayIo.emit('hello', { show: overlayShow(), frame: null, radar: null, tables: {} });
      if (item.kind === 'frame') overlayIo.emit('frame', item.frame);
      if (item.kind === 'radar') overlayIo.emit('radar', item.radar);
      if (item.kind === 'event') overlayIo.emit('event', presentEvent(item.event));
      if (item.kind === 'tables') overlayIo.emit('tables', item.tables);
    },
  });

  function followSource(source) {
    feed.follow(source).catch((err) => addLog(`Could not follow the session: ${err.message}`)).finally(publishControl);
  }

  function runAction(action) {
    const name = action?.name;
    if (name === 'follow') {
      const source = action.source === 'live' ? 'live' : 'replay';
      if (source === 'replay') {
        const recording = action.recording ?? show.replay.recording;
        if (!isRecordingId(recording) || !providers.replay.list().some((r) => r.id === recording)) throw new ActionError('Choose a recording to replay');
        providers.replay.select(recording);
        show = { ...show, source, replay: { ...show.replay, recording } };
      } else {
        show = { ...show, source };
      }
      followSource(source);
      addLog(source === 'live' ? 'Connecting to the live session' : `Replaying ${show.replay.recording}`);
    } else if (name === 'autoLive') {
      show = { ...show, autoLive: Boolean(action.on) };
      addLog(show.autoLive ? 'Live sessions will be followed automatically' : 'Automatic live following is off');
    } else if (name === 'f1tvToken') {
      try { secrets.setF1tvToken(action.token); } catch (err) { throw new ActionError(err.message); }
      addLog(secrets.publicView().present ? 'F1 TV token saved' : 'F1 TV token removed');
    } else if (name === 'alert') {
      const text = cleanText(action.text, 80);
      if (!text) throw new ActionError('Write the alert text first');
      overlayIo.emit('alert', { text, sub: cleanText(action.sub, 120), seconds: Math.min(60, Number(action.seconds) || 8) });
      addLog(`Alert: ${text}`);
      return;
    } else {
      const before = show;
      show = applyAction(show, action);
      if (name === 'delay' && before.delaySeconds !== show.delaySeconds) {
        feed.setDelay(show.delaySeconds);
        addLog(`Broadcast delay set to ${show.delaySeconds}s`);
      }
      if (name === 'replaySpeed') providers.replay?.setSpeed?.(show.replay.speed);
      if (name === 'widget' && show.widgets[action.id]?.on) feed.refreshTables();
    }
    overlayIo.emit('show', overlayShow());
    persist();
    publishControl();
  }

  // ── HTTP ──────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.get('/', (req, res) => res.redirect('/control/'));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.json({ limit: '32kb' }));
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  function requireControl(req, res, next) {
    const bearer = (req.get('authorization') || '').replace(/^Bearer /, '');
    if (sameToken(bearer || req.query.token, tokens.control)) return next();
    return res.status(401).json({ error: 'Control token missing or wrong' });
  }

  app.get('/api/recordings', requireControl, (req, res) => {
    res.json({ recordings: providers.replay?.list?.() ?? [] });
  });

  // Plain GET links, so a Stream Deck "Website" key (background mode) or Companion can press them.
  function deck(res, action) {
    try {
      runAction(action);
      res.json({ ok: true });
    } catch (err) {
      res.status(err instanceof ActionError ? 400 : 500).json({ error: err.message });
    }
  }
  app.get('/deck/toggle/:id', requireControl, (req, res) => deck(res, { name: 'widget', id: req.params.id }));
  app.get('/deck/on/:id', requireControl, (req, res) => deck(res, { name: 'widget', id: req.params.id, on: true }));
  app.get('/deck/off/:id', requireControl, (req, res) => deck(res, { name: 'widget', id: req.params.id, on: false }));
  app.get('/deck/hide-all', requireControl, (req, res) => deck(res, { name: 'hideAll' }));
  app.get('/deck/delay/:by', requireControl, (req, res) => deck(res, { name: 'delay', by: Number(req.params.by) }));

  // ── Sockets ───────────────────────────────────────────────────────
  overlayIo.use((socket, next) => {
    const { token } = socket.handshake.auth;
    if (sameToken(token, tokens.overlay) || sameToken(token, tokens.control)) return next();
    return next(new Error('unauthorized'));
  });
  overlayIo.on('connection', (socket) => {
    // A reloaded OBS source gets everything back immediately. Nothing else is accepted from it.
    socket.emit('hello', { show: overlayShow(), frame: feed.currentFrame(), radar: feed.onAirRadar, tables: feed.tables });
  });

  controlIo.use((socket, next) => {
    if (sameToken(socket.handshake.auth.token, tokens.control)) return next();
    return next(new Error('unauthorized'));
  });
  controlIo.on('connection', (socket) => {
    socket.emit('catalog', { widgets: WIDGETS, themes: THEMES, langs: LANGS, display: DISPLAY, platforms: SOCIAL_PLATFORMS, replaySpeeds: REPLAY_SPEEDS, maxDelay: MAX_DELAY, overlayToken: tokens.overlay, controlToken: tokens.control });
    socket.emit('state', controlState());
    socket.on('action', (action, reply) => {
      try {
        runAction(action);
        if (typeof reply === 'function') reply({ ok: true });
      } catch (err) {
        if (!(err instanceof ActionError)) console.error('[action]', secrets.redact(err.message));
        if (typeof reply === 'function') reply({ error: err.message });
      }
    });
  });

  function start() {
    feed.setDelay(show.delaySeconds);
    if (schedule) {
      scheduleTimer = setInterval(checkSchedule, SCHEDULE_MS);
      scheduleTimer.unref?.();
      checkSchedule();
    }
    if (show.source === 'live') followSource('live');
    else if (show.replay.recording && providers.replay?.list?.().some((r) => r.id === show.replay.recording)) followSource('replay');
  }

  function close() {
    feed.stop();
    clearInterval(scheduleTimer);
    clearTimeout(saveTimer);
    clearTimeout(changeTimer);
    io.close();
  }

  return { app, server, io, tokens, start, close, feed, getShow: () => show };
}

module.exports = { createApp };
