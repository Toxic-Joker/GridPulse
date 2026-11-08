# GridPulse: feasibility plan

MatchRoom, moved from football to Formula 1. Same idea: a self-hosted OBS overlay for watchalong streamers that follows the session by itself and holds data back until viewers see it.

Researched on 2026-11-08, during the São Paulo GP weekend. Several findings come from live probes during that session (see "Evidence").

---

## 1. What we keep from MatchRoom

These parts are not football-specific and carry over almost as they are:

| MatchRoom part | In GridPulse |
|---|---|
| `delayLine.js` (anti-spoiler buffer) | Unchanged. F1 TV runs 30–60 s behind the timing feed, so this matters even more than in football. |
| `show.js` (widgets, slots, themes, actions) | Same mechanism, new widget list (section 4). |
| `app.js` sockets: read-only overlay token, control token, origin checks, localhost bind | Unchanged. |
| `dom.js` `h()`, CSP, "feed text never becomes markup" | Unchanged. |
| Control room (buttons built from the server's widget list), OBS layers, camera guide, i18n | Unchanged in shape, new labels. |
| `engine.js` idea: first snapshot is a baseline, then diff snapshots into events | Kept, with new detectors per session type (section 5). |
| `simulator.js` idea: rehearsal produces raw provider payloads so it runs the real pipeline | Kept, and improved: the rehearsal replays a **real past F1 session** from F1's archive instead of a scripted match. |
| `budget.js` (API quota pacing) | Dropped. The F1 feed is a push stream with no quota. Replaced by reconnect with backoff. |
| `apiFootball.js` provider | Replaced (section 2). |

MatchRoom is your own code (PolyForm Noncommercial), so we can copy it. I recommend a new repo seeded from a copy of MatchRoom rather than a GitHub fork, because the domain layer is almost entirely new and the histories would just diverge.

## 2. Data sources: what is free and what is not

| Source | What it gives | Cost | Verdict |
|---|---|---|---|
| **F1 live timing feed** (`livetiming.formula1.com`, SignalR) | Timing tower, gaps and intervals, sectors and mini-sectors, lap count, session clock, track status (yellow / SC / VSC / red), race control messages, tyres and stints, weather, driver list with team colours | Free, no account | **Primary live source.** Unofficial, undocumented, used by every community tool. |
| Same feed, gated topics | **Live car positions (`Position.z`)**, car telemetry, pit stop times, live championship tables, DRS state | Needs the user's own **F1 TV subscription** token since the 2025 Dutch GP. The token lasts about a week. | Optional "bring your own F1 TV" upgrade. |
| **F1 static archive** (`livetiming.formula1.com/static/...`) | Every topic of a finished session, **including positions**, as replayable streams | Free | **Rehearsal mode and post-session replays.** Archive is generated shortly after the session ends. |
| **Jolpica** (Ergast successor, `api.jolpi.ca`) | Calendar with every session time (FP / sprint / quali / race), championship standings, results | Free, rate-limited (cache it) | **Schedule, countdowns, standings.** Updates some hours after a race. |
| **MultiViewer circuit API** (`api.multiviewer.app/api/v1/circuits/{key}/{year}`) | Track outline (x/y), rotation, corner numbers, pit-loss times | Free, unofficial | **Track drawing for the radar.** Cache per circuit; fall back to an outline built from archive positions. |
| OpenF1 | Same data as above, cleaner REST | Historical is free **except during a live session**, when it locks everything (past data too) behind a paid key | **Avoid as a dependency.** It fails exactly when the overlay is on air. |
| API-Football | — | — | Not needed any more. |

So the whole product can run at zero cost. The one thing money buys is exact live car positions, and that money is an F1 TV subscription many F1 streamers already have.

## 3. The track radar (replaces the football radar)

MatchRoom's radar already had an honest rule: API-Football had no ball tracking, so the ball was an illustration and the widget said so. GridPulse uses the same rule with three modes, chosen automatically:

| Mode | When | How | Label on air |
|---|---|---|---|
| **Live** | Live session, F1 TV token present | Real `Position.z` x/y for every car, about 3–4 updates a second, smoothed between samples, put through the delay line | none |
| **Estimated** | Live session, no token | Each car placed on the track from timing data: last mini-sector completed plus the car's current pace, moved along the outline. Accurate to a mini-sector (roughly 200–300 m), good enough to show the order, gaps, battles and who is in the pits | "Estimated positions" |
| **Replay** | Rehearsal, or any finished session | Real archive positions | "Replay" |

What we take from termf1 is knowledge, not code: which feed topics to subscribe to, how `Position.z` and `CarData.z` are decoded (base64 + raw deflate), and how the MultiViewer outline is rotated and scaled to match car coordinates. **termf1 has no licence**, so its code cannot legally be copied; we reimplement those few pieces in Node. undercut-f1 (GPL-3, 910 stars, active) is the better reference for the live protocol and delay handling, but GPL code also can't be pasted into a PolyForm project, so it is reading material only.

Radar features: team-coloured dots with three-letter codes, leader highlight, a "battle" spotlight (two selected cars and the gap between them), pit lane shown separately, track status colours the track (yellow sector, SC / VSC / red), 2D and tilted 3D like the current radar, and a full-screen version.

## 4. Widgets: football to F1

| Slot | MatchRoom | GridPulse |
|---|---|---|
| top | Scoreboard | **Session bug**: GP name, session (FP2 / Q2 / Sprint / Race), lap N/M or time remaining, track status flag |
| ribbon | Goal scorers | **Race control ticker**: penalties, investigations, track limits, flags |
| leftTop | Match stats / Pre-match | **Session preview** (circuit, weather, tyre allocation) / **Weather** |
| leftBottom | League table / Other matches | **Championship** (Jolpica) / **Projected championship** during a race / **Weekend so far** (results of earlier sessions) |
| rightTop | Lineups / Ratings | **Timing tower** (changes per session type) / **Tyre strategy** (stints) |
| rightBottom | Socials / Sponsor | Unchanged |
| bottom | Radar / Pressure index / Shootout | **Track radar** / **Battle gap** (interval trend between two cars: closing or not) / **Quali knockout** |
| full | Countdown / Full-time / Radar 3D / Table / Bracket | **Countdown to session** / **Results and podium** / **Radar full screen** / **Standings full** / **Weekend timeline** |

Themes: auto theme by circuit or by a followed team, using team colours from the feed. "Followed teams" becomes "followed drivers". Our own fonts and art only: no F1 logos, fonts or official imagery.

## 5. Each session type is its own mode

The session type comes from the feed's `SessionInfo` (and Jolpica's calendar), and switches the timing tower, the events engine and which widgets are offered.

### Practice (FP1, FP2, FP3)
- Tower sorted by best lap, with gap to fastest, laps run and current tyre.
- Clock counts down the time remaining.
- Events: new fastest lap of the session, red flag, a driver stopped on track, lap deleted for track limits.
- Extras: long-run pace (average of consecutive laps on one compound), tyre usage per team.
- Usually not much on screen: offer a "quiet" layout.

### Qualifying (Q1/Q2/Q3) and Sprint Qualifying (SQ1/SQ2/SQ3)
- Tower with the **elimination line** (the cut after P15 in Q1 and P10 in Q2), status per car: in garage, out lap, on a flying lap, finished.
- Segment clock, and a "last chance" state when the clock runs out with cars still on flying laps.
- Events: provisional pole, driver knocked out, driver jumps out of the drop zone, lap deleted, red flag.
- Knockout widget replaces the penalty shootout widget.
- Sprint qualifying uses the same mode with shorter segments and the sprint tyre rules.

### Sprint and Race
- Running order with interval and gap, laps N/M, tyre and stint age, pit stop count.
- Events: lights out, **overtake** (filtered: position changes caused by pit stops or retirements are not overtakes), new leader, pit stop, fastest lap, safety car / VSC / red flag and their ending, penalty, retirement, chequered flag.
- Lap 1 is chaos: no single overtake banners, a "lap 1 summary" instead.
- Battle gap widget and projected championship.
- Results screen and podium at the flag. A sprint and a race get different points tables.

## 6. What is not possible, or not for free

- **Exact live car positions without F1 TV.** Not available since the 2025 Dutch GP. The estimated radar is the free answer.
- **Pit stop durations, DRS state, live championship tables from the feed** without F1 TV. Pit stops still show (count, lane entry and exit); the championship is computed by us from the running order plus Jolpica's pre-race standings.
- **OpenF1 during live sessions** without paying. Confirmed live today: it returned "Live F1 session in progress. Global API access (including past sessions) is restricted to authenticated users".
- **Video, onboard cameras, team radio audio on stream.** Video isn't in any free feed, and replaying team radio audio on a stream is a copyright risk. We could show radio as text if the feed carries a transcript; it doesn't today.
- **Official branding.** F1 names and logos are trademarks. Fine to name sessions and drivers; not fine to use F1's logo, fonts or "official" wording.
- **Stability guarantee.** The live feed is unofficial. F1 changed it in 2025 (gating, a protocol move to SignalR Core) and can change it again. Mitigation: one provider module, the archive replay as an always-working rehearsal, and a stale-but-on-air policy (MatchRoom already keeps the last frame on air when the feed fails).

## 7. Things to prove first (spikes, about two days)

1. **Node live client.** Connect from Node to the live feed without an account during a session, record which topics actually arrive, and save them in the replay format. Check whether it is classic SignalR (what termf1 uses) or SignalR Core (`@microsoft/signalr` on npm).
2. **Archive replay.** Download a full 2026 session from the static archive, including `Position.z`, and replay it at speed. The year index (`/static/2026/Index.json`) answered 401 today, so session paths may have to come from `SessionInfo` or Jolpica instead.
3. **Track alignment.** Draw a MultiViewer outline and archive positions on the same SVG and confirm they line up after rotation.
4. **Estimated radar quality.** Compare estimated positions against real archive positions for a past race. Ship it only if the order and battles look right.
5. **2026 rules.** 2026 cars have active aero and an overtake mode instead of DRS. Check what the feed now sends for these, and drop the DRS ideas.

## 8. Build order

1. **Kickoff.** PRD, architecture, essentials doc, AGENTS.md (project-kickoff), seeded from this plan.
2. **Core port.** Copy MatchRoom's server shell, delay line, show, sockets, control room, overlay shell. Delete football providers and widgets. Tests for the delay line and show carry over as they are.
3. **Feed layer.** Live provider + archive replay provider emitting the same raw messages, a state merger (the feed sends partial patches that merge into one state), and `normalize.js` from that state to a session snapshot.
4. **Race mode first** (most streamed): session bug, timing tower, race events, results.
5. **Track radar**: replay mode, then estimated mode, then F1 TV live mode.
6. **Qualifying mode**, then **Practice mode**, then **Sprint** specifics.
7. **Calendar and standings** from Jolpica: countdown, championship, projected championship, weekend timeline.
8. **F1 TV token**: pasted in the control room, stored server side next to the existing tokens, never sent to overlay pages.
9. **Hardening**: feed changes, reconnects, a stale feed on air, end-to-end rehearsal test.

## 9. Questions for you

- Do you (or the streamers you're building for) have **F1 TV**? It decides whether live mode or estimated mode is the radar's main path.
- **Race-first** as above, or all session types at once?
- Same licence as MatchRoom (PolyForm Noncommercial)? That also suits F1's data terms better than a commercial product would.

## Evidence

- MatchRoom read via `gh`: `docs/ARCHITECTURE.md`, `server/domain/*`, `server/feed.js`, `server/show.js`, `public/overlay/radar.js`, `widgets.js`.
- termf1: `internal/livetiming/signalr.go` (topics, `F1TV_TOKEN` cookie), `internal/api/multiviewer/client.go`, `internal/api/f1static/client.go`. Repo has no licence file.
- undercut-f1 README: the list of features gated behind F1 TV since the 2025 Dutch GP, and that imported finished sessions still contain everything.
- Live probes, 2026-11-08: OpenF1 locked during the session (quote above); `static/SessionInfo.json` free (São Paulo GP race, archive "Generating"); `static/2026/Index.json` 401; MultiViewer circuit 63 returned outline, corners and pit loss; Jolpica returned 2026 standings and the round 20 schedule.
