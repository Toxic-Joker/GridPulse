# GridPulse

A self-hosted Formula 1 overlay for watchalong streamers. It follows a race or sprint by itself — running order, gaps, tyres, flags, a track radar and the big moments — and holds everything back until your viewers see it on TV. Free data only; an F1 TV token is an optional upgrade for exact live car positions. Built on [MatchRoom](https://github.com/Toxic-Joker/MatchRoom).

> Status: v1 race mode works: live feed with auto-connect, recording and replay, a rehearsal race, the anti-spoiler delay, session bar, ticker, timing tower, race moments, track radar (estimated or F1 TV), championship and projected championship, countdown and results. Qualifying (Q1/Q2/Q3 drop zone, knockouts, pole) and practice timesheets are built and waiting to be checked against a real session at Las Vegas. Panels: weather, session preview, tyre strategy, socials, sponsor. Rehearsals for race, qualifying and practice are included. See [docs/PRD.md](docs/PRD.md).

## Run it

You need [Node.js 20 or newer](https://nodejs.org).

```bash
npm install
```

```bash
npm start
```

Open the control room link it prints. Overlay links for OBS come from the control room.

## Tests

```bash
npm test
```

## Docs

- [Product requirements](docs/PRD.md)
- [Architecture essentials](docs/ARCHITECTURE-ESSENTIALS.md) and [full architecture](docs/ARCHITECTURE.md)
- [Feasibility research](docs/PLAN.md)

GridPulse is unofficial and not associated with Formula 1. Licence: PolyForm Noncommercial 1.0.0.
