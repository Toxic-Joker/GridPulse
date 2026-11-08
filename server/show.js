// The show: everything the operator controls. The server owns it, so a closed
// control tab or a reloaded OBS source changes nothing that is on air.
// Mechanism from MatchRoom; widget list for F1 (see docs/PRD.md and PLAN.md section 4).

const WIDGETS = {
  sessionBug: { slot: 'top', label: 'Session bar', group: 'Always on air' },
  ticker: { slot: 'ribbon', label: 'Race control ticker', group: 'Always on air' },
  preview: { slot: 'leftTop', label: 'Session preview', group: 'Left, top' },
  weather: { slot: 'leftTop', label: 'Weather', group: 'Left, top' },
  championship: { slot: 'leftBottom', label: 'Championship', group: 'Left, bottom', options: { table: ['drivers', 'constructors'] } },
  projected: { slot: 'leftBottom', label: 'Projected championship', group: 'Left, bottom' },
  tower: { slot: 'rightTop', label: 'Timing tower', group: 'Right, top', options: { show: ['interval', 'gap'] } },
  tyres: { slot: 'rightTop', label: 'Tyre strategy', group: 'Right, top' },
  socials: { slot: 'rightBottom', label: 'Socials', group: 'Right, bottom' },
  sponsor: { slot: 'rightBottom', label: 'Sponsor', group: 'Right, bottom' },
  radar: { slot: 'bottom', label: 'Track radar', group: 'Under the camera', options: { mode: ['2d', '3d'] } },
  waiting: { slot: 'full', label: 'Countdown screen', group: 'Full screen' },
  results: { slot: 'full', label: 'Results and podium', group: 'Full screen' },
  radarFull: { slot: 'full', label: 'Track radar', group: 'Full screen' },
  championshipFull: { slot: 'full', label: 'Championship', group: 'Full screen' },
};

const THEMES = {
  night: { label: 'Night race', ink: '#0d1220', raised: '#18203a', chalk: '#f3f5fb', muted: '#a3abc4', accent: '#ff3b3b', onAccent: '#1d0303', back1: '#141c33', back2: '#05070e', track1: '#2a3350', track2: '#1c2440' },
  pitwall: { label: 'Pit wall', ink: '#121414', raised: '#1f2323', chalk: '#f4f6f5', muted: '#a9b2af', accent: '#3ee08f', onAccent: '#04210f', back1: '#1c2222', back2: '#070909', track1: '#323a3a', track2: '#262d2d' },
  paddock: { label: 'Paddock', ink: '#1c1408', raised: '#2e2210', chalk: '#fff8ec', muted: '#cdbb9c', accent: '#f2b632', onAccent: '#1a1405', back1: '#33260f', back2: '#0f0a03', track1: '#4a3a1c', track2: '#3c2f16' },
};

const LANGS = ['en', 'fr', 'es', 'pt'];
const SOCIAL_PLATFORMS = ['x', 'instagram', 'tiktok', 'youtube', 'twitch', 'kick'];
const DISPLAY = {
  lights_out: ['fullscreen', 'banner', 'off'],
  overtake: ['banner', 'off'],
  new_leader: ['fullscreen', 'banner', 'off'],
  pit: ['banner', 'off'],
  fastest_lap: ['banner', 'off'],
  track_status: ['fullscreen', 'banner', 'off'],
  penalty: ['banner', 'off'],
  retirement: ['banner', 'off'],
  restart: ['fullscreen', 'banner', 'off'],
  lap1_summary: ['banner', 'off'],
  chequered: ['fullscreen', 'banner', 'off'],
};
const REPLAY_SPEEDS = [1, 5, 20];
const MAX_DELAY = 300;

function defaultShow() {
  const widgets = {};
  Object.keys(WIDGETS).forEach((id) => { widgets[id] = { on: false, at: 0, opts: {} }; });
  widgets.sessionBug.on = true;
  widgets.ticker.on = true;
  widgets.tower.opts = { show: 'interval' };
  widgets.championship.opts = { table: 'drivers' };
  widgets.radar.opts = { mode: '2d' };
  return {
    source: 'replay',
    replay: { recording: null, speed: 20 },
    widgets,
    delaySeconds: 0,
    themeId: 'night',
    themeAuto: false,
    custom: {},
    lang: 'en',
    background: '',
    cameraGuide: false,
    auto: { lights_out: 'fullscreen', overtake: 'banner', new_leader: 'banner', pit: 'banner', fastest_lap: 'banner', track_status: 'banner', penalty: 'banner', retirement: 'banner', restart: 'banner', lap1_summary: 'banner', chequered: 'fullscreen' },
    socials: [{ platform: 'x', handle: '@yourchannel' }],
    sponsor: { text: '', logo: '' },
    countdown: { title: '', target: null },
    followedDrivers: [],
  };
}

// Keeps saved settings usable after widgets or fields are added in an update.
function reviveShow(saved) {
  const base = defaultShow();
  if (!saved || typeof saved !== 'object') return base;
  const show = { ...base, ...saved, auto: { ...base.auto, ...saved.auto }, replay: { ...base.replay, ...saved.replay } };
  show.widgets = base.widgets;
  Object.keys(WIDGETS).forEach((id) => {
    if (saved.widgets?.[id]) show.widgets[id] = { ...base.widgets[id], ...saved.widgets[id] };
  });
  return show;
}

class ActionError extends Error {}

const HEX = /^#[0-9a-f]{6}$/i;
const DRIVER_CODE = /^[A-Z]{3}$/;
const fail = (message) => { throw new ActionError(message); };
const cleanText = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function httpsUrl(v) {
  const url = cleanText(v, 1000);
  if (url && !/^https:\/\//.test(url)) fail('Image links must start with https://');
  return url;
}

function setWidget(show, id, on, opts, now) {
  const def = WIDGETS[id] || fail(`Unknown widget: ${id}`);
  const current = show.widgets[id];
  const next = { ...current, on, at: on ? now : current.at, opts: { ...current.opts } };
  Object.entries(opts || {}).forEach(([k, v]) => {
    if (!def.options?.[k]?.includes(v)) fail(`Invalid ${k} for ${id}`);
    next.opts[k] = v;
  });
  const widgets = { ...show.widgets, [id]: next };
  // A slot holds one widget: lighting one up replaces its neighbour.
  if (on && !['top', 'ribbon'].includes(def.slot)) {
    Object.entries(WIDGETS).forEach(([other, d]) => {
      if (other !== id && d.slot === def.slot) widgets[other] = { ...widgets[other], on: false };
    });
  }
  return { ...show, widgets };
}

function applyAction(show, action, now = Date.now()) {
  const a = action || {};
  switch (a.name) {
    case 'widget': {
      const on = a.on === undefined ? !show.widgets[a.id]?.on : Boolean(a.on);
      return setWidget(show, a.id, on, a.opts, now);
    }
    case 'hideAll': {
      const widgets = { ...show.widgets };
      Object.keys(widgets).forEach((id) => {
        if (!['sessionBug', 'ticker'].includes(id)) widgets[id] = { ...widgets[id], on: false };
      });
      return { ...show, widgets };
    }
    case 'delay': {
      const seconds = a.by !== undefined ? show.delaySeconds + Number(a.by) : Number(a.seconds);
      if (!Number.isFinite(seconds)) fail('Delay must be a number of seconds');
      return { ...show, delaySeconds: Math.max(0, Math.min(MAX_DELAY, Math.round(seconds))) };
    }
    case 'replaySpeed': {
      const speed = Number(a.speed);
      if (!REPLAY_SPEEDS.includes(speed)) fail('Invalid replay speed');
      return { ...show, replay: { ...show.replay, speed } };
    }
    case 'theme':
      if (!THEMES[a.id]) fail(`Unknown theme: ${a.id}`);
      return { ...show, themeId: a.id, themeAuto: false };
    case 'themeAuto':
      return { ...show, themeAuto: Boolean(a.on) };
    case 'customColors': {
      const custom = {};
      ['accent', 'ink'].forEach((k) => {
        if (a[k]) { if (!HEX.test(a[k])) fail(`Invalid colour for ${k}`); custom[k] = a[k]; }
      });
      return { ...show, custom };
    }
    case 'lang':
      if (!LANGS.includes(a.lang)) fail(`Unknown language: ${a.lang}`);
      return { ...show, lang: a.lang };
    case 'background':
      return { ...show, background: httpsUrl(a.url) };
    case 'cameraGuide':
      return { ...show, cameraGuide: Boolean(a.on) };
    case 'auto': {
      if (!DISPLAY[a.kind]?.includes(a.value)) fail('Invalid automatic event setting');
      return { ...show, auto: { ...show.auto, [a.kind]: a.value } };
    }
    case 'socials': {
      const socials = (Array.isArray(a.socials) ? a.socials : []).slice(0, 6).map((s) => {
        if (!SOCIAL_PLATFORMS.includes(s.platform)) fail(`Unknown platform: ${s.platform}`);
        return { platform: s.platform, handle: cleanText(s.handle, 40) };
      }).filter((s) => s.handle);
      return { ...show, socials };
    }
    case 'sponsor':
      return { ...show, sponsor: { text: cleanText(a.text, 60), logo: httpsUrl(a.logo) } };
    case 'countdown': {
      const target = a.target ? Number(a.target) : null;
      if (target !== null && !Number.isFinite(target)) fail('Countdown needs a valid time');
      return { ...show, countdown: { title: cleanText(a.title, 60), target } };
    }
    case 'followedDrivers': {
      // Validate the whole value: truncating first would turn "ver1" into a valid "VER".
      const codes = (Array.isArray(a.codes) ? a.codes : []).slice(0, 22).map((c) => cleanText(c, 10).toUpperCase());
      if (codes.some((c) => !DRIVER_CODE.test(c))) fail('Driver codes are three letters, like VER');
      return { ...show, followedDrivers: [...new Set(codes)] };
    }
    default:
      return fail(`Unknown action: ${a.name}`);
  }
}

// TODO(themes): themeAuto by followed team colour once the feed provides team colours.
function themeTokens(show) {
  const id = show.themeId;
  return { id, ...THEMES[id], ...(show.custom.accent ? { accent: show.custom.accent } : {}), ...(show.custom.ink ? { ink: show.custom.ink } : {}) };
}

module.exports = { WIDGETS, THEMES, LANGS, DISPLAY, SOCIAL_PLATFORMS, REPLAY_SPEEDS, MAX_DELAY, defaultShow, reviveShow, applyAction, themeTokens, ActionError, cleanText };
