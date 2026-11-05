# AnyoneCanPace

Mobile-first PWA for volunteer pacers (AnyoneCanRun by Les Stooopids). React 19 + TypeScript + Vite 8 + plain CSS + vite-plugin-pwa. No backend, accounts, analytics or tracking.
The app always opens on the mode picker (`src/Root.tsx`, no mode is remembered), in this order: **Daily Dashboard** (`src/dashboard/`, lazy-loaded), **ACR Run/Walk Timer** (`App.tsx`), **6K Route Library** (`src/sixk/`, lazy-loaded).
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
- `src/weather/`: pure weather logic. `forecast.ts` (GEM URL + parsing), `outfit.ts` (**TIERS / MODIFIERS tables**, `RUN_FEEL_OFFSET_C`), `runTime.ts` (default hour, daylight, outfit input), `sun.ts` (solar elevation, UV estimate: GEM has no UV), `cache.ts`. `src/dashboard/`: DashboardMode, useForecast, `dashboard.css`. The `.duck-slot` is where Stage 3's dressed duck goes.
- `scripts/`: `build-routes.ts` (+ pure `lib/process-route.ts`, `lib/elevation.ts`, `lib/turns.ts`), `cut-map.ts`, `check-bundle.ts`, `dev-cert.ts`. `routes/`: source GPX, `routes.config.json`, `cache/` (elevation, streets, proposed turns), `review/` (turn and elevation review reports: suggestions, not verified).
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
- Turn cues fire once per stage (heads-up ~150 m, now ~30 m). Turns passed in a GPS gap (>10 s without a fix) are skipped silently; a turn jumped over between close fixes (≤60 m past) still gets a late "now". Cue only for fresh fixes while visible; never replay.
- Vitest's on-disk module cache is off (`fsModuleCache: false`) because it missed new routes picked up by `import.meta.glob`.
- Off route: >30 m for 5 s → banner, the confused duck (`duck-runner-lost.webp`, source `design/duck-confused.webp`) with a "?", "Going rogue?" dialog. Going rogue calms the banner but keeps the confused duck until back on route. Finish only after 90 % covered and near the end. Ending a route needs the menu and two taps.
- Privacy: GPS positions live in memory for the current route only. Never store, log or send them.

## Dashboard rules
- The only runtime request to another site is the GEM weather request in `forecast.ts`, with fixed Montréal coordinates, never the user's location. Fetch only when the dashboard opens or comes back into view and the saved copy is >30 min old, or on REFRESH. Keep the last forecast in localStorage and always show when it's from; fall back to "Check outside".
- The outfit is always shown as text; the duck is decorative (`aria-hidden`). Credit Open-Meteo (CC BY 4.0) and Environment Canada's GEM on the page.
- Dressed duck: `src/dashboard/duck/` (`pieces.ts` has `LAYER_ORDER` and is pure; `DressedDuck.tsx` stacks `src/assets/duck-outfit/<item>.webp` (512 px, transparent, drawn in place; art brief in `design/duck-art-brief/`) over `duck-base.webp`). Every outfit ItemId except `singlet` needs a piece (a test enforces it). Falling rain/snow is CSS, off for reduced motion.

## Advisories rules
- `src/data/advisories.json` is hand-edited by pull request. `src/advisories/notices.ts` is pure (filtering by route and date, expiry, validation). A test validates the real file. Always show "Last checked".
- Automated sources (a road-closures file from a scheduled Action, Environment Canada warnings) plug in as more `Notice[]` lists with a `kind`. The closures Action is **researched, not built**: ask before adding workflow files (they need the `workflow` scope and the user's go-ahead). Montréal `info-travaux` facts and noise numbers are in the README.
- Credit "© OpenStreetMap contributors" and the route's source (e.g. On The Go Map) in the UI. Raw GPX stays in `routes/`; only processed files ship.
- The duck is the 6K position marker (no progress ring there). Banner text always states the direction; icons and colours are extras.

## Paths and deploy
- GitHub Pages project site. `vite.config.ts` derives `base` (`/anyoneCanPace/`) from `GITHUB_REPOSITORY` or the git remote. In `index.html` reference public files as `/file.png`, never `%BASE_URL%` (Vite adds the base itself).
- Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, test, build, deploy. It does not run on pull requests or other branches. Repo is public (Pages on free plan).
- Feature work happens on branches. Never merge into `main` or open PRs unless asked.
- Pushing workflow-file changes needs gh's `workflow` scope (`gh auth refresh -s workflow`).
- **Ask before pushing.** Committing locally is fine.
- Beta channel: remote `beta` = github.com/ShereenElaidi/anyoneCanPace-beta (Pages at `/anyoneCanPace-beta/`). Same code; a base path containing "beta" sets `__BETA__` (BETA tag, "AnyoneCanPace Beta" name/title). Pushing a branch to `beta`'s `main` deploys it there without touching the live app. Still ask before each push.

## Brand
Crew Navy `#1B3F72` (RUN), Track Blue `#378ADD` (WALK), Duck Gold `#EF9F27` (progress, primary button), Pavement `#F5F0E8` (background), Asphalt `#2C2C2A` (text, outlines). White on Track Blue only passes contrast for large text, so keep text there ≥ 19 px bold.
Font: self-hosted JetBrains Mono (SIL OFL) in `src/assets/fonts/`, tabular numerals for the timer. Spacilo Mono can't be used (personal-use demo license).
Icons: running duck from `design/duck-mascot.webp`. Full duck on Pavement for home-screen icons, head crop for 16/32 px favicons, smaller duck in `maskable-512x512.png` for Android's safe zone.
