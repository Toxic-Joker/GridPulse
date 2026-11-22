// The data models every module after normalize.js works with. Plain JSON, so
// they cross the sockets unchanged. Raw F1 topic shapes never leave state.js
// and normalize.js. See docs/ARCHITECTURE.md, "Data models".

/** @typedef {'race'|'sprint'|'qualifying'|'sprint_qualifying'|'practice'} SessionType */
/** @typedef {'pre'|'running'|'suspended'|'finished'|'ended'} SessionStatus */
/** @typedef {'green'|'yellow'|'sc'|'vsc'|'vsc_ending'|'red'} TrackStatus */
/** @typedef {'SOFT'|'MEDIUM'|'HARD'|'INTERMEDIATE'|'WET'|'UNKNOWN'} Compound */
/** @typedef {'live'|'estimated'|'replay'} RadarMode */

/**
 * One raw message from a provider. Topic "*" carries a full state (the Subscribe
 * reply, or the first line of a recording); any other topic is a patch.
 * @typedef {{ topic: string, data: object, at: number }} FeedMessage
 */

/**
 * @typedef {object} SessionInfo
 * @property {number} key
 * @property {number} year
 * @property {string} meetingName
 * @property {number} circuitKey      Same key MultiViewer uses.
 * @property {string} circuitName
 * @property {string} country
 * @property {SessionType} type
 * @property {string} name            As F1 names it: "Race", "Sprint", "Qualifying".
 * @property {string} path            Archive path, e.g. "2026/2026-11-08_São_Paulo_Grand_Prix/2026-11-08_Race/".
 */

/**
 * @typedef {object} DriverRow
 * @property {string} number
 * @property {string} code            Three letters, e.g. "VER".
 * @property {string} name
 * @property {string} team
 * @property {string} teamColour      Hex without '#', from the feed.
 * @property {number|null} position
 * @property {number|null} gridPosition
 * @property {string} gapToLeader     As shown: "+1.234", "1 L", "LAP 12".
 * @property {string} interval
 * @property {string} lastLap
 * @property {string} bestLap
 * @property {number} laps
 * @property {number} pitStops
 * @property {boolean} inPit
 * @property {boolean} pitOut
 * @property {boolean} retired
 * @property {boolean} stopped
 * @property {boolean} knockedOut
 * @property {{ compound: Compound, age: number, isNew: boolean }} tyre
 * @property {{ sector: number, segment: number, segmentsPerLap: number, at: number }|null} progress
 *           Last completed mini-sector, for the estimated radar.
 */

/**
 * @typedef {object} RCMessage
 * @property {number} at
 * @property {number|null} lap
 * @property {string} category
 * @property {string} message
 * @property {string|null} flag
 */

/**
 * @typedef {object} SessionSnapshot
 * @property {number} at              When the snapshot was taken.
 * @property {SessionInfo} session
 * @property {SessionStatus} status
 * @property {{ status: TrackStatus, since: number }} track
 * @property {{ current: number, total: number|null }} laps
 * @property {{ remainingMs: number|null, running: boolean, rate: number }} clock
 * @property {DriverRow[]} drivers    Sorted by position.
 * @property {{ number: string, time: string, lap: number }|null} fastestLap
 * @property {RCMessage[]} raceControl Newest last, at most 50.
 * @property {{ airTemp: number, trackTemp: number, humidity: number, rainfall: boolean, windSpeed: number }|null} weather
 */

/**
 * A moment worth showing. `key` is unique per real-world moment, so it is never announced twice.
 * Types: lights_out, overtake, new_leader, battle, pit, fastest_lap, track_status, penalty,
 * retirement, lap1_summary, restart, chequered, session_status.
 * @typedef {{ type: string, key: string, at: number } & Record<string, any>} RaceEvent
 */

/**
 * @typedef {object} RadarFrame
 * @property {RadarMode} mode
 * @property {number} at
 * @property {{ number: string, x: number, y: number, inPit: boolean, retired: boolean }[]} cars
 *           x/y in the circuit's own coordinates.
 */

/**
 * @typedef {object} Circuit
 * @property {number} key
 * @property {number} year
 * @property {number} rotation        Degrees, from MultiViewer.
 * @property {[number, number][]} outline
 * @property {{ number: number, x: number, y: number }[]} corners
 * @property {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @property {number[]} distance      Cumulative distance along the outline, same length as outline.
 * @property {number} lengthM
 */

/**
 * @typedef {object} Calendar
 * @property {number} season
 * @property {{ round: number, name: string, circuitId: string, country: string,
 *   sessions: { type: SessionType, name: string, startsAt: string }[] }[]} rounds
 */

/**
 * @typedef {object} Standings
 * @property {number} season
 * @property {number} round
 * @property {{ code: string, name: string, team: string, points: number, position: number }[]} drivers
 * @property {{ team: string, points: number, position: number }[]} constructors
 */

const SESSION_TYPES = ['race', 'sprint', 'qualifying', 'sprint_qualifying', 'practice'];
const TRACK_STATUSES = ['green', 'yellow', 'sc', 'vsc', 'vsc_ending', 'red'];
const COMPOUNDS = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET', 'UNKNOWN'];
const RADAR_MODES = ['live', 'estimated', 'replay'];

module.exports = { SESSION_TYPES, TRACK_STATUSES, COMPOUNDS, RADAR_MODES };
