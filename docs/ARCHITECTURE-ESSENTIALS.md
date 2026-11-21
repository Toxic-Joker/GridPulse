# Architecture essentials

Read this first on every task. Detail: [ARCHITECTURE.md](ARCHITECTURE.md). Product: [PRD.md](PRD.md).

**GridPulse** = MatchRoom (football OBS overlay) moved to Formula 1. Self-hosted, free data only, anti-spoiler delay.

## Stack
Node 20+ (CommonJS server), Express 5, socket.io 4, `@microsoft/signalr`, `dotenv`. Browser: plain ES modules, SVG + CSS, no framework, no build step. Tests: `node --test`. Persistence: JSON files in `data/`.

## Data sources (all free)
- F1 live feed (SignalR Core) — timing, flags, tyres, race control. Positions only with the user's F1 TV token.
- GridPulse's own recordings of live sessions (data/recordings) → rehearsal, plus a generated fictional race (rehearsal.js) for first runs. F1's archive needs F1 TV since Oct 2026.
- Jolpica — calendar, standings, results. MultiViewer — circuit outlines.
- **Not** OpenF1 (locked during live sessions), **not** any paid API.

## Pipeline
`provider → FeedMessage {topic,data,at} → state.js (merge patches) → normalize.js (SessionSnapshot, 4 Hz) → engine.js + detectors (RaceEvent) → delayLine.js → feed.js → app.js → sockets`
Radar: `positions.js` (real) or `estimator.js` (estimated) → `RadarFrame` 4 Hz → delay line.

## Folder map
```
server/domain/     pure logic, no I/O (state, normalize, engine, detectors/, points, estimator, positions, track, delayLine, types)
server/providers/  I/O only (f1Live, recordings, replay, rehearsal, archive, jolpica, multiviewer, cache)
server/            index, app (sockets/auth), feed (runs a session), show (widgets/actions), secrets
public/overlay/    OBS page; public/control/ control room; public/shared/
test/              domain/, server/, fixtures/ (synthetic only)
data/              git-ignored runtime state, caches, replays, secrets
```

## Core models (server/domain/types.js)
- `SessionSnapshot` { session{type: race|sprint|qualifying|sprint_qualifying|practice}, status, track{status}, laps, clock, drivers[], fastestLap, raceControl[], weather }
- `DriverRow` { number, code, team, teamColour, position, gridPosition, gapToLeader, interval, laps, pitStops, inPit, pitOut, retired, tyre{compound, age}, progress{segment} }
- `RaceEvent` { type, key, at, ... } — `key` unique per real-world moment
- `RadarFrame` { mode: live|estimated|replay, cars[{number, x, y, inPit}] }
- `Circuit` { key, year, rotation, outline, corners, bounds } · `Show` (MatchRoom shape) · `Secrets` { f1tvToken }

## Rules that must always hold
1. The server owns the show; browsers only render state they're sent.
2. First snapshot (and every reconnect) is a baseline: announce nothing that already happened.
3. All feed data goes through the delay line; operator actions don't.
4. Live and replay emit the same raw F1 payloads through the same pipeline. Topic "*" = full state → re-baseline.
5. Estimated data is labelled on air. Radar order never contradicts the tower.
6. Overtakes: green/yellow only, lap ≥ 2, no pit/retired cars, same lap, debounced, never after the flag.
7. Never hard-code grid size (22 cars in 2026) or quali cut positions.
8. Feed problems keep the last state on air; status becomes `stale`.
9. Feed text only becomes text nodes (`h()` in dom.js); image URLs `https:` or `data:image/`.
10. F1 TV token never leaves the server: not in sockets, show.json, or logs.
11. Throttles run on the wall clock, not the replay clock.
12. An out lap runs from pit exit to the line: the feed's `PitOut` clears after sector 1, so `TimingState.outLap` carries it (D15).
13. Each session on the calendar gets its own live connection and recording, even back to back (D16).
14. `Inactive` with `Started` "Started" is a red flag (`suspended`), not pre-session; the clock keeps running while suspended (D17).
15. A lap finished after the flag still counts for fastest time and pole (D18).
16. A knocked-out car shows the time it went out with (D19).
17. Being connected to the due session is not enough: it must also be recording, or the calendar check reconnects (D20).

## Don't
- Don't copy code from termf1 (no licence), undercut-f1 (GPL), f1-dash (AGPL). Read only.
- Don't add OpenF1 or paid providers. Don't add a frontend framework or bundler.
- Don't commit real F1 data; test fixtures are synthetic.
- Don't use F1 logos, fonts or "official" wording.
- Don't put I/O in `server/domain/` or domain logic in providers.
- Don't add a dependency without GitHub-first research and `repo-vetting`.
