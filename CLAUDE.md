# AnyoneCanPace

Mobile-first PWA for volunteer pacers (AnyoneCanRun by Les Stooopids). React 19 + TypeScript + Vite 8 + plain CSS + vite-plugin-pwa. No backend, accounts, analytics or tracking.
Modes behind a picker (`src/Root.tsx`, last mode remembered): **ACR Run/Walk Timer** (`App.tsx`), **6K Route Library** (`src/sixk/`, lazy-loaded), Daily Dashboard (coming soon).
Live: https://shereenelaidi.github.io/anyoneCanPace/ · Full details, limitations and the **V2 To-Do List** are in README.md.

## Commands
- Node and npm live in `~/.local/bin`. If `npm` is "not found", use `~/.local/bin/npm` or `source ~/.zshrc`.
- `npm run dev` → http://localhost:5173/anyoneCanPace/
- `npm test` (Vitest), `npm run typecheck`, `npm run build` (also runs `scripts/check-bundle.ts`). Run all three before committing.
- `npm run preview` serves the production build. Service workers only register there, not in dev.
- `npm run routes` rebuilds `src/data/routes/` from `routes/*.gpx` (keeps hand-edited name/turns/notes/advisories; `--offline`, `--reset-turns`). `npm run map` re-cuts `public/maps/montreal.pmtiles` (then bump `MAP_VERSION` in `src/sixk/map/offlineMap.ts`).
- GPS needs HTTPS: `npm run dev:https` (self-signed, `.cache/dev-cert/`) or a Cloudflare/ngrok tunnel. Scripts are `.ts` run by Node 22.18+ directly.

## Layout
- `src/timer/engine.ts`: pure interval logic (start/pause/resume/skip/sync). No clocks, no React.
- `src/timer/clock.ts`: monotonic clock (`performance.now()`), corrected for device sleep using `Date.now()`.
- `src/hooks/useIntervalTimer.ts`: React binding. 250 ms display ticks, catch-up on visibility change, events.
- `src/hooks/useWakeLock.ts`, `src/lib/cues.ts` (Web Audio beeps + vibration), `src/lib/prefs.ts` (localStorage).
- `src/components/`: TimerDisplay, EditPanel, MenuSheet, ModePicker. `src/App.tsx` composes the timer page. Styles in `src/styles.css`.
- `src/nav/`: pure route following (`geo`, `route`, `tracker`, `banner`). All tunables in `nav/constants.ts`. No clocks, DOM or `navigator`: fixes carry their own timestamps.
- `src/sixk/`: 6K mode UI (SixKMode, Library, RoutePage, FollowView, useRouteNav, `sixk.css`). `src/sixk/map/`: RouteMap (MapLibre + PMTiles), `mapStyle.ts`, `offlineMap.ts` (whole map file in Cache Storage). `src/hooks/useGeolocation.ts`.
- `scripts/`: `build-routes.ts` (+ pure `lib/process-route.ts`), `cut-map.ts`, `check-bundle.ts`, `dev-cert.ts`. `routes/`: source GPX, `routes.config.json`, `cache/` (elevation, streets, proposed turns).
- Tests: `src/**/*.test.ts(x)`, `scripts/**/*.test.ts`. `App.test.tsx` drives the real timer UI with fake timers (keep it untouched). `Root.test.tsx` covers the picker and 6K UI with mocked geolocation and a stubbed RouteMap. `src/nav/testing/replay.ts` replays synthetic GPS tracks.

## Rules that must not break
- Timing: while active, store only `endsAt` and derive remaining = `endsAt - now`. Never count ticks down. New intervals start at the previous boundary, not at "now".
- Duration edits apply to the **next** occurrence of that phase. Never reset, pause or restart the running interval.
- No auto-reload mid-session. The SW uses `registerType: 'prompt'` and updates are offered in Settings only when no session is active.
- Don't replay missed cues after suspension. Only cue transitions under 2 s old while the page is visible.
- Reset/End stays in the Settings sheet behind a two-tap confirm, away from the main controls.
- Accessibility: touch targets ≥ 44 px, phase text never conveyed by colour alone, announce phase/pause changes (not every second), respect reduced motion.
- No new heavy dependencies (no state libraries, UI kits or analytics). **Exception:** MapLibre GL JS and the PMTiles reader, for the 6K mode only, and only lazy-loaded. `scripts/check-bundle.ts` fails the build if either reaches the first-load bundle. Build-time-only dev dependencies for scripts are fine if justified.

## 6K route rules
- Progress is forward-only and matched in a window around current progress (it grows during GPS gaps). Never snap to the globally nearest point: routes overlap and a loop's start and finish are close.
- Turn cues fire once per stage (heads-up ~150 m, now ~30 m), and turns passed in a GPS gap are skipped silently. Cue only for fresh fixes while visible; never replay.
- Off route: >30 m for 5 s → banner, "?" on the duck, "Going rogue?" dialog. Finish only after 90 % covered and near the end. Ending a route needs the menu and two taps.
- Privacy: GPS positions live in memory for the current route only. Never store, log or send them. The only runtime requests are the app's own files (Stage 2 will add one weather request with fixed Montréal coordinates).
- Credit "© OpenStreetMap contributors" and the route's source (e.g. On The Go Map) in the UI. Raw GPX stays in `routes/`; only processed files ship.
- The duck is the 6K position marker (no progress ring there). Banner text always states the direction; icons and colours are extras.

## Paths and deploy
- GitHub Pages project site. `vite.config.ts` derives `base` (`/anyoneCanPace/`) from `GITHUB_REPOSITORY` or the git remote. In `index.html` reference public files as `/file.png`, never `%BASE_URL%` (Vite adds the base itself).
- Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, test, build, deploy. It does not run on pull requests or other branches. Repo is public (Pages on free plan).
- Feature work happens on branches. Never merge into `main` or open PRs unless asked.
- Pushing workflow-file changes needs gh's `workflow` scope (`gh auth refresh -s workflow`).
- **Ask before pushing.** Committing locally is fine.

## Brand
Crew Navy `#1B3F72` (RUN), Track Blue `#378ADD` (WALK), Duck Gold `#EF9F27` (progress, primary button), Pavement `#F5F0E8` (background), Asphalt `#2C2C2A` (text, outlines). White on Track Blue only passes contrast for large text, so keep text there ≥ 19 px bold.
Font: self-hosted JetBrains Mono (SIL OFL) in `src/assets/fonts/`, tabular numerals for the timer. Spacilo Mono can't be used (personal-use demo license).
Icons: running duck from `design/duck-mascot.webp`. Full duck on Pavement for home-screen icons, head crop for 16/32 px favicons, smaller duck in `maskable-512x512.png` for Android's safe zone.
