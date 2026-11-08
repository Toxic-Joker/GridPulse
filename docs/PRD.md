# GridPulse: product requirements

Status: draft for v1 · 2026-11-08 · Source research: [PLAN.md](PLAN.md)

## Problem

F1 watchalong streamers commentate over a session they can't rebroadcast. Their stream is a webcam and a chat. Showing the running order, gaps, tyres, flags and where the cars are means alt-tabbing into a timing app, which spoils the action because live timing runs 30–60 seconds ahead of the TV picture their viewers are watching.

MatchRoom solved this for football. GridPulse is the same product for Formula 1.

## Target user

A solo or small-team streamer on Twitch, YouTube or Kick who watches F1 sessions live with their audience, runs OBS on a Windows or Mac PC, and is comfortable running `npm start` from a README. Not a broadcaster with a production crew, not a data analyst.

## Goals and success metrics

| Goal | Metric for v1 |
|---|---|
| The overlay runs a whole session without anyone touching it | A full race replayed from the archive runs start to flag with zero operator actions and no console errors |
| No spoilers | With the delay set, no on-air change (order, flag, event) appears before the matching moment on the streamer's TV, within ±2 s of the set delay |
| Free to run | Every v1 feature works with no paid account. The F1 TV token only upgrades the radar |
| Fast to set up | From `git clone` to an overlay in OBS showing the rehearsal replay in under 5 minutes |
| Honest data | Anything estimated is labelled as estimated on air |

## v1 scope

v1 covers **race and sprint** sessions fully. For practice and qualifying, v1 shows the session bug and a basic tower sorted by the feed's own order, without the special modes (those come in v1.1).

### User stories

**1. Rehearsal from a real past race**
As a streamer, I want to try the overlay on a real finished race before race day, so I can set up OBS without waiting for a live session.
- Works with no account or key.
- The control room lists finished race and sprint sessions of the current and previous season. Choosing one downloads it once and caches it under `data/`.
- F1's archive index can be unavailable (it answered 401 on 2026-11-08), so the list is built from the calendar plus every session GridPulse has seen live. If a session still can't be found, the streamer can paste its archive path.
- Replay speed is adjustable (1×, 5×, 20×), and the replay goes through exactly the same pipeline as live data.
- If the download fails, the control room says so plainly and keeps the last cached session available.

**2. Follow a live race or sprint automatically**
As a streamer, I want the overlay to connect to the live session by itself, so I can focus on commentating.
- The control room shows the next session from the calendar, with a countdown. Within 15 minutes of its start, GridPulse connects to the live feed. A "Connect now" button does it at any time.
- It stays connected through delays and red flags until the feed marks the session finalised, or 5 hours after the scheduled start.
- The overlay shows the session bug (GP name, "Race" or "Sprint", lap N/M, track status) and the timing tower (position, driver code, team colour, interval or gap, tyre and its age, pit stop count).
- The tower fits 22 cars (11 teams in 2026) and never assumes a fixed grid size. It handles lapped cars, retirements, pit-lane starts, cars that don't start, and a race ended on time rather than laps.
- If the feed drops, the last state stays on air, the control room shows "stale", and GridPulse reconnects with backoff.
- When the session ends, the feed stops and the results screen becomes available.

**3. Never spoil the action**
As a streamer, I want to delay all data to match my TV, so my viewers never see something before it happens on screen.
- One delay setting, 0–300 s, adjustable in 1 s and 5 s steps from the control room and Stream Deck links.
- Everything from the feed (tower, radar, events, flags) is delayed. Widget toggles and manual triggers are not.
- Lowering the delay releases a backlog: the latest state goes on air, but moments older than 15 s are dropped instead of celebrated late.

**4. Automatic race moments**
As a streamer, I want big moments announced on screen as they happen on TV.
- Detected: lights out, overtake, new leader, pit stop, fastest lap, safety car / VSC deployed and ending, red flag, penalty (from race control), retirement, chequered flag.
- A position change caused by a pit stop or a retirement is not announced as an overtake. Neither are changes under a safety car, VSC or red flag, changes that undo themselves within a second, or reordering after the flag (penalties).
- On lap 1, single overtakes are not announced. After lap 1, a "lap 1" summary shows the biggest gains and losses.
- A restart after a red flag gets its own "restart" moment.
- At most one overtake banner every 5 seconds. Others go to the ticker, and overtakes involving followed drivers or the top 3 go first.
- Joining a session already running announces nothing that already happened.
- Each moment type can be set to full screen, banner or off in the control room.

**5. Track radar**
As a streamer, I want to show where the cars are on the circuit.
- The radar draws the real circuit outline with corner numbers and team-coloured car dots with driver codes.
- **Replay** (rehearsal or finished session): real car positions.
- **Estimated** (live, default, free): cars placed from timing data, labelled "Estimated positions" on air. The order on the radar always matches the tower.
- **Live** (live, F1 TV token set): real car positions, no label.
- Track status colours the track (yellow, SC, VSC, red). Cars in the pit lane are shown as in the pits.
- A "battle" option highlights two chosen cars and the gap between them.
- 2D and tilted 3D, plus a full-screen version.

**6. Standings and the weekend**
As a streamer, I want to show the championship and what's coming.
- Drivers' and constructors' championship from the calendar/results source, refreshed at most hourly.
- During a race or sprint: a projected championship from the current running order and the right points table (race top 10, sprint top 8; no fastest-lap point). Its base is the standings before this session, including the weekend's sprint even if the standings source hasn't added it yet.
- Countdown screen to the next session with its name and local time.
- Results and podium screen after the flag.

**7. Control and OBS like MatchRoom**
- Private control room link; read-only overlay links safe to paste into OBS.
- One widget per screen area; lighting one replaces its neighbour.
- Themes, team colours, four languages (en, fr, es, pt), socials and sponsor widgets, camera guide, optional backdrop layer.

**8. F1 TV token (optional)**
As a streamer with F1 TV, I want exact live positions.
- The token is pasted into the control room, stored only on the server, never sent to overlay pages or logs.
- The control room shows whether the token is present and when it expires; when it's missing or expired the radar falls back to Estimated without interrupting the show.

## v1.1 (next, not in v1)

- Qualifying mode: elimination line, car status (garage, out lap, flying lap, finished), segment clock, knocked-out and provisional-pole moments, knockout widget. Same for sprint qualifying.
- Practice mode: best-lap tower, time-remaining clock, long-run pace, tyre usage, "quiet" layout.
- Battle gap widget (interval trend between two cars).
- Weekend timeline full-screen widget.

## Non-goals

- Video, onboard cameras, or team radio audio.
- Detailed telemetry charts (throttle, brake, speed traces). termf1 and others do this; our viewers are watching a stream.
- Hosting GridPulse as a service for others. It runs on the streamer's machine.
- Official F1 logos, fonts or "official" wording.
- Paid data providers, including OpenF1's live key.
- Mobile app. The control room works in a phone browser on the local network, as in MatchRoom.

## Constraints

- **Budget:** free. No paid service required for any v1 feature.
- **Platform:** Node 20+, runs locally (`npm start` or Docker), overlays are OBS browser sources at 1920×1080.
- **Legal:** PolyForm Noncommercial, like MatchRoom. Data comes from unofficial, undocumented F1 sources: noncommercial use only, no F1 trademarks. termf1 (no licence) and undercut-f1 (GPL-3) are reading references only, no copied code.
- **Data source risk:** F1 can change or gate the live feed at any time (it did in 2025). The archive replay must keep working as rehearsal even if live breaks.
- **Timeline:** no fixed deadline.

## Open questions

1. Does the free live feed still connect without an account from Node, and is it classic SignalR or SignalR Core? (Spike 1.)
2. Can 2026 sessions be listed and downloaded from the archive when the year index returns 401? (Spike 2.)
3. Is the estimated radar good enough to ship? Acceptance: order always matches the tower; on a past race, a car's estimated spot is within one mini-sector of its real spot at least 90% of the time. (Spike 4.)
4. What does the 2026 feed send for active aero and overtake mode, and is any of it worth showing? (Spike 5.)
5. How long before a session can we connect, and does the feed send data during the formation lap and red-flag stoppages? (Answered by recording one live weekend.)
6. Can a session's archive path be derived reliably from the calendar (date, meeting name, session name), or only learned from `SessionInfo.Path`? (Spike 2.)
