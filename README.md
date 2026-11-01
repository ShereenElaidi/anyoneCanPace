# AnyoneCanPace

**Run together. Walk together.**

A minimalist RUN/WALK interval timer for volunteer pacers leading beginner-friendly group runs. Part of the **AnyoneCanRun (ACR)** initiative by **Les Stooopids**.

Open the URL on your phone, tap **START PACING**, and the app alternates RUN and WALK until you stop it. Adjust intervals mid-run without interrupting the group.

**Live site (once deployed):** https://shereenelaidi.github.io/anyoneCanPace/

---

## Features

- **RUN / WALK alternation** that runs indefinitely, starting with RUN. Defaults: 90 s RUN, 60 s WALK.
- **Big, glanceable display**: huge phase label, MM:SS countdown with tabular digits, a Duck Gold progress ring and a "NEXT:" hint. RUN is Crew Navy, WALK is Track Blue, and the phase is always spelled out, so colour is never the only cue.
- **Distraction-free focus mode**: only Pause/Resume, Edit Intervals and Skip are visible while pacing.
- **Mid-run edits**: ±15 s steppers (15 s – 30 min). A change applies to the **next** occurrence of that phase. The running countdown is never reset, paused or restarted.
- **Pause / Resume / Skip**: Resume continues from the exact remaining time. Skip jumps to the full opposite phase, and a paused session stays paused.
- **End & reset** lives in the Settings sheet and needs two taps, so it can't happen by accident.
- **Sound cues**: two short high beeps for RUN, one long low beep for WALK. They are synthesized with Web Audio, so there are no audio files.
- **Vibration cues** on supported devices (most Android browsers).
- **Screen Wake Lock** while a session is active, re-acquired when you return to the page.
- **Works offline** after the first visit, and can be installed to the home screen. Installing is optional.
- **Remembers your settings** (RUN, WALK, sound, vibration) in local storage. No accounts, tracking, cookies or analytics.
- **Accessible**: semantic HTML, labelled controls, visible focus, touch targets of 44 px or more, reduced-motion support. Screen readers hear RUN, WALK, Paused and Resumed, not every second.

## Tech stack

React 19 · TypeScript · Vite 8 · plain CSS · `vite-plugin-pwa` (Workbox) · Vitest + Testing Library. No backend.

```
src/
  timer/engine.ts         Pure timestamp-based interval logic (no clocks, no React)
  timer/clock.ts          Monotonic session clock with sleep correction
  hooks/useIntervalTimer  React binding: ticks, catch-up, events
  hooks/useWakeLock       Screen Wake Lock handling
  lib/cues.ts             Beeps and vibration
  lib/prefs.ts            localStorage preferences
  components/             TimerDisplay, EditPanel, MenuSheet
```

### Timing design

The timer never counts down by subtracting 1 every tick. While a session is active it stores only the moment the current interval ends (`endsAt`), and the remaining time is always `endsAt − now`. Ticks (every 250 ms) only refresh the screen, so late or throttled ticks cause no drift. Each new interval starts exactly where the previous one ended, not when the tick happened to run.

`now` comes from `performance.now()`, which is monotonic, so changing the phone's clock or time zone doesn't affect the timer. Some phones stop that clock while the device sleeps, so it is cross-checked against `Date.now()`, and any sleep gap over 1 s is added back. When the page becomes visible again, the engine applies every interval boundary that passed while it was hidden and shows the correct phase. Missed beeps are **not** replayed. A cue only plays for a change that happened in the last 2 seconds while the page was visible.

## Local development

You need Node.js 20.19+ or 22.12+ (CI uses the current LTS).

```bash
npm install
npm run dev        # http://localhost:5173/anyoneCanPace/
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run all unit and integration tests once |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript checks |
| `npm run build` | Type-check and build the production site into `dist/` |
| `npm run preview` | Serve `dist/` at the GitHub Pages path for testing |

To try it on your phone over Wi-Fi, run `npm run dev -- --host` and open the printed Network URL. Wake lock, installing and the service worker need HTTPS, so test those on the deployed site.

## Deploying to GitHub Pages

Deployment is automatic: `.github/workflows/deploy.yml` type-checks, tests, builds and deploys on every push to `main`. You can also run it by hand from the **Actions** tab.

**One-time setup:** in the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

The site is served at `https://<owner>.github.io/<repo>/`. `vite.config.ts` reads the repository name (from `GITHUB_REPOSITORY` in Actions, or `git remote get-url origin` locally) and sets Vite's `base`, the manifest's `start_url`/`scope` and the service worker scope to match. A `<owner>.github.io` repository is served from `/` instead. You can override this with `BASE_PATH=/something/`.

**Note:** GitHub Pages on a private repository needs a paid GitHub plan (Pro, Team or Enterprise). On a free account, make the repository public to use Pages.

### Checking the live site

1. Open **Actions** and wait for "Deploy to GitHub Pages" to finish (green tick).
2. Open https://shereenelaidi.github.io/anyoneCanPace/ and check the timer starts.
3. Reload once, then turn on airplane mode and reload again. The app should still open.

### Updates

The app never reloads itself mid-session. When a new version has been downloaded, **Update to new version** appears in Settings, but only while no session is running. Closing and reopening the app also picks up the new version.

## Installing on a phone (optional)

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Install app** / **Add to Home screen**.

## Browser limitations

- **Keep the page open and the screen on.** Phones pause web pages when locked or in the background. Timers and sounds can't run then, and no browser app can promise otherwise. The countdown catches up when you return, without replaying missed beeps.
- **Wake Lock** keeps the screen on in Safari 16.4+ and Chrome/Edge. It doesn't stop you locking the phone manually, and the system can still release it (for example in low-power mode). If it isn't available, the app says so. Set your phone's Auto-Lock to "Never" while pacing.
- **Sound** starts after your first tap (browser rule). On iPhone, the ring/silent switch may mute web audio.
- **Vibration** isn't supported by iPhone Safari, so the toggle is disabled there.

## Typography and licensing

The design reference was **Spacilo Mono** by RagamKata Studio. Its free download is a demo for personal use only with a limited character set. Using it on a public website needs a paid webfont license (and an app license for an installed app). So the app uses an openly licensed alternative.

Three openly licensed fonts were compared: **JetBrains Mono**, **Space Mono** and **Martian Mono**, all under SIL OFL 1.1. **JetBrains Mono** is the closest match. Like Spacilo, it has rounded-square bowls, a tall x-height and clean neo-grotesque shapes, and its variable weights go up to 800 for the heavy RUN/WALK label. Space Mono is rounder and more retro, and Martian Mono is wider and chunkier.

- **JetBrains Mono** © 2020 The JetBrains Mono Project Authors, licensed under the [SIL Open Font License 1.1](src/assets/fonts/JetBrainsMono-OFL.txt).
- Self-hosted WOFF2 files (Latin and Latin Extended subsets) are in `src/assets/fonts/` and precached for offline use.

## App icon

The running-duck mascot (source: `design/duck-mascot.webp`) is used for every icon in `public/`:

- **Home-screen icons** (`apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png`): the whole duck on Pavement.
- **`maskable-512x512.png`**: the duck drawn smaller, so Android's circle and squircle crops don't clip it.
- **`favicon-16x16.png`, `favicon-32x32.png`**: the head only, so it stays readable at tab size.

Phones that already installed the app may keep the old icon for a while. Android refreshes it automatically. On iPhone, remove the app from the home screen and add it again.

## Manual field-testing checklist

Automated tests cover the timer logic and UI flows. These need a real phone on a real run:

- [ ] **Sunlight:** RUN/WALK and the countdown are readable at arm's length in direct sun, at full and at auto brightness.
- [ ] **Sweaty hands:** PAUSE, SKIP and the ±15 s buttons work with damp fingers and while jogging. No mis-taps on neighbouring buttons.
- [ ] **Wake lock:** the screen stays on for a full 20+ minute session (iPhone Safari, iPhone home-screen app, Android Chrome, Android installed app).
- [ ] **Audible cues:** beeps are audible over traffic and chatter, with the phone in a hand and in a pocket or armband. Check the iPhone silent switch.
- [ ] **Vibration** (Android): noticeable while running.
- [ ] **Mid-run changes:** shorten RUN mid-interval. The current RUN finishes unchanged and the next one is shorter.
- [ ] **Accidental taps:** pocket the unlocked phone for a minute. Nothing reset (End needs two taps).
- [ ] **Interruptions:** take a call, switch apps and lock the phone for 2–3 minutes. On return the phase and time are correct, and there's no burst of old beeps.
- [ ] **Battery:** note battery use over a 45-minute session with the screen on.
- [ ] **Offline:** start a session in airplane mode after one earlier visit.
- [ ] **Install:** add to home screen on iOS and Android. The icon, name, standalone display and portrait layout all look right.
