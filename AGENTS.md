# GridPulse

Self-hosted F1 overlay for OBS watchalong streamers: session bug, timing tower, track radar, race moments and standings, driven by free F1 data and held back by an anti-spoiler delay. It is MatchRoom (football) moved to Formula 1.

Read first: [docs/ARCHITECTURE-ESSENTIALS.md](docs/ARCHITECTURE-ESSENTIALS.md). Product: [docs/PRD.md](docs/PRD.md). Detail when needed: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Feasibility research: [docs/PLAN.md](docs/PLAN.md).

## Commands

```
npm install
npm start        # prints the control room link (http://127.0.0.1:3000)
npm run dev      # restarts on change
npm test         # node --test, all tests in test/
```
No lint or build step. Docker: `docker compose up --build`.

## Conventions

- Server is CommonJS (`require`), browser code is ES modules served as-is. No bundler, no framework, no TypeScript; types are JSDoc in `server/domain/types.js`.
- `server/domain/` is pure: no network, files, timers or `Date.now()` (pass `now`/`at` in). `server/providers/` does I/O and nothing else.
- Raw F1 topic shapes (`TimingData`, `Lines`, `_deleted`, `.z`) stay inside `state.js` and `normalize.js`. Everything after normalize uses `SessionSnapshot`.
- Overlay and control DOM is built with `h()` from `public/overlay/dom.js`. Never `innerHTML` with feed data.
- On-air text lives in `public/overlay/i18n.js` in en, fr, es, pt.
- New widget: add to `WIDGETS` in `server/show.js` with its slot, then its `data`/`render` in `public/overlay/widgets.js`. The control room builds buttons from the server list.
- Comments explain why, in plain sentences, like MatchRoom's.
- Names: files camelCase, classes PascalCase, event types snake_case (`new_leader`).

## Workflow

- Small, verifiable steps. Every domain change gets a test in `test/domain/` with synthetic fixtures from `test/fixtures/`.
- Run `npm test` before saying something is done, and start the app when the change is visible on screen.
- When a decision changes, update `docs/ARCHITECTURE.md` (decisions log) and `docs/ARCHITECTURE-ESSENTIALS.md` in the same change. Scope changes go in `docs/PRD.md`.
- The live feed is unofficial and can change. When it surprises you, record what you saw in the decisions log.

## Boundaries

- Never commit secrets or anything under `data/` (tokens, F1 TV token, caches, replays). Never log the F1 TV token or send it over a socket.
- Never commit real F1 feed data; fixtures are written by hand.
- Don't copy code from termf1, undercut-f1 or f1-dash (licences incompatible). Reading them is fine.
- Ask before adding a dependency. Search GitHub first, prefer free and permissive, vet with the `repo-vetting` skill.
- No paid data providers, no OpenF1, no F1 logos or fonts.
- `public/vendor/` holds third-party fonts under their own licence: don't edit.
