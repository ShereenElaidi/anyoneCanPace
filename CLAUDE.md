# AnyoneCanPace

Mobile-first RUN/WALK interval timer PWA for volunteer pacers (AnyoneCanRun by Les Stooopids). React 19 + TypeScript + Vite 8 + plain CSS + vite-plugin-pwa. No backend, accounts, analytics or tracking.
Live: https://shereenelaidi.github.io/anyoneCanPace/ · Full details, limitations and the **V2 To-Do List** are in README.md.

## Commands
- Node and npm live in `~/.local/bin`. If `npm` is "not found", use `~/.local/bin/npm` or `source ~/.zshrc`.
- `npm run dev` → http://localhost:5173/anyoneCanPace/
- `npm test` (Vitest), `npm run typecheck`, `npm run build`. Run all three before committing.
- `npm run preview` serves the production build. Service workers only register there, not in dev.

## Layout
- `src/timer/engine.ts`: pure interval logic (start/pause/resume/skip/sync). No clocks, no React.
- `src/timer/clock.ts`: monotonic clock (`performance.now()`), corrected for device sleep using `Date.now()`.
- `src/hooks/useIntervalTimer.ts`: React binding. 250 ms display ticks, catch-up on visibility change, events.
- `src/hooks/useWakeLock.ts`, `src/lib/cues.ts` (Web Audio beeps + vibration), `src/lib/prefs.ts` (localStorage).
- `src/components/`: TimerDisplay, EditPanel, MenuSheet. `src/App.tsx` composes the page. Styles in `src/styles.css`.
- Tests: `src/**/*.test.ts(x)`. `App.test.tsx` drives the real UI with fake timers.

## Rules that must not break
- Timing: while active, store only `endsAt` and derive remaining = `endsAt - now`. Never count ticks down. New intervals start at the previous boundary, not at "now".
- Duration edits apply to the **next** occurrence of that phase. Never reset, pause or restart the running interval.
- No auto-reload mid-session. The SW uses `registerType: 'prompt'` and updates are offered in Settings only when no session is active.
- Don't replay missed cues after suspension. Only cue transitions under 2 s old while the page is visible.
- Reset/End stays in the Settings sheet behind a two-tap confirm, away from the main controls.
- Accessibility: touch targets ≥ 44 px, phase text never conveyed by colour alone, announce phase/pause changes (not every second), respect reduced motion.
- No new heavy dependencies (no state libraries, UI kits or analytics).

## Paths and deploy
- GitHub Pages project site. `vite.config.ts` derives `base` (`/anyoneCanPace/`) from `GITHUB_REPOSITORY` or the git remote. In `index.html` reference public files as `/file.png`, never `%BASE_URL%` (Vite adds the base itself).
- Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, test, build, deploy. Repo is public (Pages on free plan).
- Pushing workflow-file changes needs gh's `workflow` scope (`gh auth refresh -s workflow`).
- **Ask before pushing.** Committing locally is fine.

## Brand
Crew Navy `#1B3F72` (RUN), Track Blue `#378ADD` (WALK), Duck Gold `#EF9F27` (progress, primary button), Pavement `#F5F0E8` (background), Asphalt `#2C2C2A` (text, outlines). White on Track Blue only passes contrast for large text, so keep text there ≥ 19 px bold.
Font: self-hosted JetBrains Mono (SIL OFL) in `src/assets/fonts/`, tabular numerals for the timer. Spacilo Mono can't be used (personal-use demo license).
Icons: running duck from `design/duck-mascot.webp`. Full duck on Pavement for home-screen icons, head crop for 16/32 px favicons, smaller duck in `maskable-512x512.png` for Android's safe zone.
