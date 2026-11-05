# AnyoneCanPace

**Run together. Walk together.**

Tools for volunteer pacers leading beginner-friendly group runs. Part of the **AnyoneCanRun (ACR)** initiative by **Les Stooopids**.

The app always opens on **"What are we doing today?"**, a mode picker:

- **Daily Dashboard**: the weather at your run time and what to wear for it.
- **ACR Run/Walk Timer**: open the URL on your phone, tap **START PACING**, and the app alternates RUN and WALK until you stop it. Adjust intervals mid-run without interrupting the group.
- **6K Route Library**: pick a ~6 km route and follow it on a street map, with the duck marking your place, a direction banner and turn cues.

The app doesn't remember the last mode, so it always starts here. Your timer intervals and other settings are still remembered. To change modes, use **Settings → Switch mode** in the timer (two taps while a session is running), or **MODES** in the route library and dashboard.

**Live site (once deployed):** https://shereenelaidi.github.io/anyoneCanPace/

---

## ACR Run/Walk Timer

- **RUN / WALK alternation** that runs indefinitely, starting with RUN. Defaults: 90 s RUN, 60 s WALK.
- **Big, glanceable display**: huge phase label, MM:SS countdown with tabular digits, a Duck Gold progress ring with the running duck riding its leading edge, and a "NEXT:" hint. RUN is Crew Navy, WALK is Track Blue, and the phase is always spelled out, so colour is never the only cue.
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

## 6K Route Library

- **Library**: each route shows its name, distance, climb and descent, and a small outline.
- **Route page**: map preview, stats, elevation profile, turn list, notes, advisories and **START ROUTE**.
- **Follow view**:
  - A street map with the duck at your place on the route. It faces your direction of travel. A small blue dot with an accuracy halo shows the raw GPS fix.
  - A direction banner, always with text: "Right on Boulevard Saint-Laurent in 150 m", "Continue on … for 1.2 km", "Left now on …".
  - One stats line: "3.2 km done · 2.8 km to go".
  - No timer and no progress ring.
- **Starting**:
  - Before you start, the banner says "Head to the start: 420 m" with an arrow and a compass direction.
  - Anywhere within about 250 m of the start counts as "at the start".
  - **START ANYWAY** is always there, so a pacer who joins mid-way is placed where they are on the route.
- **Progress only moves forward.** Each GPS fix is matched only to the stretch of route just behind or ahead of you, never to the nearest point overall. Routes can overlap themselves (the sample loop's finish is 37 m from its start), and GPS jitter or a short gap won't throw you around.
- **Turn cues**:
  - A heads-up about 150 m before each turn and a "now" cue at about 30 m. Each fires once.
  - Vibration patterns: one pulse for left, two for right, one long buzz for a U-turn. Matching beeps play if Sound is on, so iPhones (no vibration) still get a cue.
  - Screen readers hear turns, not distance ticks.
  - A turn you passed during a GPS gap (no fix for 10 s or more) is skipped silently. Missed cues are never replayed.
  - If one jittery fix cuts a sharp corner and jumps just past a turn (up to 60 m, no gap), the "now" cue still fires, a moment late rather than never.
- **Off route**:
  - Triggers after about 5 s more than ~30 m from the route.
  - You get a dashed warning banner that points back toward the route, the duck turns into the confused duck with a "?", a buzz, and **"Going rogue?"**. **YES, GEWWW AWAEYYY!** calms the banner (the duck stays confused until you're back on the route); **NO, GUIDE ME BACK** keeps the warning. Pressing Start while you're more than 30 m from the route also shows the confused duck (on your GPS dot, with "Head to the route") until you join it, without the buzz or the dialog.
  - Answer yes and the app stops nagging until you're back on the route.
- **Finish**: triggers near the last point, only after about 90 % of the distance is covered.
- **Ending a route** needs **MENU → END ROUTE** and a second tap. The phone's back gesture opens that menu instead of leaving mid-route.
- All of these distances and times are named constants in `src/nav/constants.ts`.

### Adding or editing a route

Source GPX files live in `routes/` and are committed. The app ships only the processed files in `src/data/routes/`, never the raw GPX.

1. Put the GPX in `routes/` and add an entry to `routes/routes.config.json` (id, file, name, source credit).
2. Run `npm run routes`. For each route, the script (`scripts/build-routes.ts`):
   - removes the routing tool's tiny dead-end spurs and duplicate points (a real out-and-back turnaround is kept)
   - simplifies the line to about 5 m while keeping corners
   - measures the distance and classifies the route (loop, out-and-back or point-to-point)
   - looks up bare-earth elevation every 10 m and cleans it (see "Elevation" below)
   - proposes turns from heading changes and fills street names from OpenStreetMap (see "Turn suggestions" below)
   - writes `<id>.json`, `<id>.geojson` and `manifest.json`, plus a review report in `routes/review/<id>.md` (and `.json`)
3. Edit `src/data/routes/<id>.json` by hand: `name`, `startStreet`, and each turn's `dir`, `street` and `note`. Also `notes` and `advisories`. Re-running the script keeps these hand edits. `npm run routes -- --reset-turns` replaces the turns with fresh proposals, which are also always written to `routes/cache/<id>.proposed-turns.json` for comparison.

Elevation comes from Natural Resources Canada's [Canadian Digital Elevation Model](https://open.canada.ca/data/en/dataset/7f245e4d-76c2-4caa-951a-45d1d2051333) (CDEM) through the GeoGratis elevation API, and only at build time. Street names come from OpenStreetMap through the Overpass API. Both lookups are cached in `routes/cache/`, so `npm run routes -- --offline` rebuilds without a network. Turn directions are first guesses: always check them against the map and the review report.

#### Elevation

Code: `scripts/lib/elevation.ts` (pure, tested in `elevation.test.ts`).

- **Bare earth, not rooftops.** Until November 2026 the build used Open-Meteo's Copernicus GLO-90, a 90 m *surface* model: it measures roofs and tree tops. Downtown that gave the Sample Loop 127 m of climb (10–87 m raw). Two independent bare-earth models (NRCan's CDEM and the `dtm` layer of NRCan's elevation service) agree on about 45 m, and three surface models (Copernicus, NRCan's `dsm`, SRTM) all give 119–148 m, whatever the processing. No filter can take the buildings out of a surface model, so the source changed. The old samples are kept in `routes/cache/<id>.elevation-copernicus.json`, and the review report shows them for comparison.
- **Processing, all measured in metres along the route:**
  1. Runs of identical values (a nearest-cell DEM sampled more densely than its grid) become one point per cell, joined by straight lines, so the profile has no stairs.
  2. Spikes: a Hampel filter replaces a value only when it's further from the median of the values within 1.5 cells either side than both 3 robust standard deviations and the DEM's error. One bad cell is outvoted; a steady climb is untouched.
  3. A moving average two cells wide removes ups and downs shorter than the grid can represent (the sampling theorem).
  4. Climb and descent use hysteresis: a change of direction only counts once the elevation has moved by more than the DEM's point-to-point error (2 m) plus its 1 m rounding, and every confirmed climb counts in full.
  5. Missing values are bridged with straight lines and reported. With no data at all, the build stops rather than writing 0 m.
- **Limitations.** The CDEM is built from older survey data at about 20 m resolution. NRCan publishes no single point-to-point accuracy for it, so 2 m is assumed. Bridges, tunnels and overpasses are shown at ground level, not at the height you actually run. Expect a few metres of uncertainty in the totals: the Sample Loop is 44 m with this method and 45–47 m from other bare-earth data.

#### Turn suggestions

Code: `scripts/lib/turns.ts` (pure, tested in `turns.test.ts`). Every candidate turn, with its decision and the reason, goes to `routes/review/<id>.md`. Lines marked "yes" need checking. None of it is verified.

1. **Candidates:** points where the heading over 20 m before and after changes by 35° or more. Curves gentler than about a 65 m radius never qualify.
2. **One manoeuvre:** candidates less than 40 m apart are grouped, because the app couldn't announce them separately anyway ("now" at 30 m, plus 10 m of grace past a turn). Each group is measured from its approach leg to its exit leg (30 m each):
   - net change under 35° and the route stays within 20 m (about one Montréal street width) of the straight line: a **jog** (a crossing, lane or sidewalk change). Rejected, but reported.
   - a clear net change and the route stays within 20 m of a single corner: **one turn** (consolidated).
   - the exit is parallel to the approach but further to the side: a **dogleg**, or **round a short block**. Two instructions, the first move and the last.
   - anything else: one instruction for the net change, flagged as **complex** (loops, ramps).
3. **Kept even when it looks redundant:** a turn that stays on the same street (flagged "same street": a bend, or a turn that stays on it), and a small kink or jog where the named way changes (it may be a fork).
4. **Start:** a turn within 30 m of the first point is folded into the start. The start street is named from the first leg only, and stays empty when no street matches there.
5. **Street names:** matched per leg, only to OpenStreetMap streets running the same way as the route (within 35°), so a cross street at a corner doesn't win. A name change on its own never creates a turn.

All routes so far were drawn with [On The Go Map](https://onthegomap.com) on OpenStreetMap data:

| Route | Source GPX | After cleaning | Climb |
|---|---|---|---|
| Sample Loop | `onthegomap-6.4-km-route.gpx` | 6.36 km loop, 4 spurs removed | +127 m |
| Pi Day | `onthegomap-4.7-km-route.gpx` | 4.61 km loop, 4 spurs removed | +39 m |
| Canal Test | `onthegomap-12.5-km-route.gpx` | 12.36 km loop along the Lachine Canal, 2 spurs removed | +29 m |

### The street map

- **Vector tiles**: a self-hosted [PMTiles](https://protomaps.com/docs/pmtiles) file, `public/maps/montreal.pmtiles`. It is a 9.9 MB extract of south-central Montréal (about 8 × 10 km, from downtown and the Plateau's edge down the Lachine Canal past Angrignon, zoom 0–15) from the [Protomaps](https://protomaps.com) daily OpenStreetMap build, drawn with MapLibre GL JS in the brand colours.
- **Labels**: street-name glyphs (Noto Sans Medium, SIL OFL) are self-hosted in `public/maps/fonts/` and precached, so labels work offline. No sprites are used.
- **Re-cutting the map**: run `npm run map` after adding a route outside the current map. It downloads the `pmtiles` CLI into `.cache/tools/` if needed, and covers every route in `src/data/routes/` plus about 1.1 km around them. Use `npm run map -- --bbox=W,S,E,N` for a fixed area instead.
  - The whole island (`-73.98,45.40,-73.47,45.71`) is about **55 MB**, which is too big for a one-time download on a phone. Prefer a box around the routes.
  - After re-cutting, bump `MAP_VERSION` in `src/sixk/map/offlineMap.ts` so phones fetch the new file.
- **Offline**: the map file is not cached piece by piece. The first time you open the route library (online, and not in data-saver mode), the whole file is saved to the phone's Cache Storage, and the map then reads from that copy. The library shows the status honestly ("Map saved for offline use on …", "Saving… 40 %", "not saved") with a **SAVE MAP FOR OFFLINE** button. The map shows "Online map (not saved for offline)" while it is streaming from the network.

## Daily Dashboard

- **Layout: the answer first.** The dressed duck, with a "feels like" sticker, the outfit headline and the item chips fill the first screen. Weather numbers and tips are folded under **Weather details and tips**. A fresh "Updated …" line and REFRESH sit at the bottom; an offline, failed or old forecast moves that line to the top. With no advisories there's one "No route advisories. Last checked …" line; active ones show as a card at the top.
- **Weather at run time.** Pick when the run starts from a strip of hour chips (6 a.m. to 9 p.m., up to 3 days ahead; radio buttons, so arrow keys and screen readers work). The default is the next **10 a.m.** (today before 10, otherwise tomorrow; `DEFAULT_RUN_HOUR` in `src/weather/runTime.ts`). The details show feels-like and air temperature, conditions, the chance of rain or snow, wind and gusts, and sunrise and sunset.
- **What to wear**, always as text: a headline, item chips (names only) and tips. Why an item is worn ("Cap: the brim keeps rain out of your eyes") is the item's `why` in `outfit.ts` and goes in the tips.
- **The duck dresses for it.** The mascot wears one drawn layer per outfit item (a gold tee, navy long sleeve, gold raincoat and cap, toque and mittens, a safety-yellow vest and headlamp in the dark…), with rain or snow falling behind it (off when the phone asks for reduced motion). It's decoration only, hidden from screen readers; the text list carries the meaning. The pieces were drawn with ChatGPT from the brief in `design/duck-art-brief/` and fitted onto the duck. To swap one, see `src/assets/duck-outfit/README.md`.
- **Dress for the run feel, not the weather.** Run feel is the feels-like temperature **+ 7 °C** (`RUN_FEEL_OFFSET_C`), lower than the usual racing advice of about +10 °C because pacers run/walk and stand around at the start.

| Run feel | Starting point |
|---|---|
| 25 °C and up | Singlet, shorts, cap |
| 18 to 25 °C | Tee, shorts, cap |
| 10 to 18 °C | Tee or light long sleeve, shorts |
| 3 to 10 °C | Long sleeve, tights, light gloves |
| −4 to 3 °C | Long sleeve and light jacket, tights, gloves, headband |
| Below −4 °C | Thermal layers, windproof shell, toque, mittens, neck warmer |

Modifiers:

- **Rain** (a 50 % chance, 0.3 mm in the hour, or a rain code): raincoat (it replaces the light jacket or shell) and a cap with a brim.
- **Strong wind** (25 km/h, or gusts of 40 km/h): windbreaker, or "zip your jacket up" if you already have one.
- **Snow, freezing rain, snow on the ground, or wet at 1 °C or below**: shoes with grip and a slippery note.
- **Dark** at the start: reflective vest and headlamp. Getting dark during the run: reflective vest.
- **Always**: bring an extra layer for the wait at the start.

The tiers and thresholds are starting points. Tune them in the `TIERS` and `MODIFIERS` tables in `src/weather/outfit.ts`; the tests cover each tier and modifier.

**Weather source.** [Open-Meteo](https://open-meteo.com)'s Environment Canada GEM endpoint (`https://api.open-meteo.com/v1/gem`), 48 hours ahead, for fixed central-Montréal coordinates. The data is free for non-commercial use under CC BY 4.0 and credited on the page.

**No sun or UV advice.** GEM has no UV index, and the earlier estimate (from the sun's height and cloud cover) was removed along with sunglasses, so the outfit never mentions sun protection.

**Requests and offline.**
- The forecast is fetched when the dashboard opens or comes back into view, only if the saved copy is more than 30 minutes old. **REFRESH** fetches it on demand.
- The last forecast is kept on the phone, with "Updated 7:42 a.m." shown.
- Offline, or if the request fails, the page uses the saved forecast and says when it's from. It adds "may be out of date" after 6 hours.
- If there is no forecast, or it no longer covers the coming hours, the page says **Check outside**.

## Advisories

Short notices about a route (a closure, a detour, stairs) or about every run. They show on the route page (that route's notices, then general ones) and in the dashboard's **Route advisories** (all of them), each as text with where, when and a source link, plus "Last checked" for the list.

**Adding a notice:** edit `src/data/advisories.json` in a pull request. Set `lastChecked` to today, and add to `notices`:

```json
{
  "id": "commune-sewer-2026-11",
  "route": "sample-loop",
  "text": "Rue de la Commune Ouest closed for sewer work. Use the north sidewalk.",
  "fromKm": 1.1,
  "toKm": 2.1,
  "start": "2026-10-30",
  "end": "2026-11-06",
  "source": "https://donnees.montreal.ca/dataset/info-travaux"
}
```

- `route` is a route id (`sample-loop`, `pi-day`, `canal-test`) or `"global"`.
- `fromKm`/`toKm`, `start`/`end` and `source` are optional. Dates are inclusive, in Montréal time.
- A notice shows from its `start` and **disappears by itself** after its `end`. Without an `end` it stays until removed.
- `npm test` checks the file and explains any mistake in plain words (bad date, unknown route, duplicate id). CI runs the same check.
- A route's own `advisories` list in its JSON still works, but the central file is easier to review.

**Automatic road-closure flags (researched, not built).** Montréal publishes road works daily as open data ("Entraves et travaux en cours", `info-travaux`, CC BY 4.0, no key needed). Each item is a single point with a date range and a separate list of impacts (street closed, lane, sidewalk closed or narrowed, bike path). On 2026-11-04 about 1,700 items were active. Within 25 m of each route there were 14 (Sample Loop), 18 (Pi Day) and 5 (Canal Test), mostly sidewalk work and parking-lane obstructions. Keeping only street closures, closed sidewalks and closed bike paths left about 6, 7 and 2. Limits:
- Points, not street segments, so cross streets near an intersection give false positives.
- There is no link to each individual permit.
- The time stamps look shifted by a time-zone bug, so only the dates are trustworthy.
- The Lachine Canal path itself isn't covered.
- Québec 511's open feed covers only provincial highways (it flagged the Ville-Marie tunnel under the Sample Loop, a false positive), and Montréal's real-time closures feed currently returns 404.

A daily GitHub Action could build a "possible closures" file from this, with the caveats that scheduled workflows can be delayed and are switched off after about 60 days without repository activity. It is not built until the crew decides it's worth it.

## Privacy and offline

- No backend, accounts, cookies, analytics or tracking.
- **Your GPS position stays on your phone.** It is held in memory for the current route only. It is never stored, logged or sent anywhere, and the map tiles come from the app's own files, not a map service.
- **The only request the app makes to another site** is the Daily Dashboard's weather request to `api.open-meteo.com`, for **fixed central-Montréal coordinates, never your location**. It is made only when you open the dashboard and the saved forecast is more than 30 minutes old (or you tap REFRESH). Everything else is the app's own files. Elevation and street-name lookups happen only when a developer runs `npm run routes`, never in the app.
- After one visit, the timer, routes, stats and map work offline. Anything that can go stale shows when it was saved.
- Saved on the device: timer settings, the offline map and the last weather forecast.

## Tech stack

React 19 · TypeScript · Vite 8 · plain CSS · `vite-plugin-pwa` (Workbox) · Vitest + Testing Library. No backend.

The 6K mode adds **MapLibre GL JS** and the **PMTiles** reader. They are loaded only when a 6K map is shown, so the timer never downloads them on first load. `npm run build` runs `scripts/check-bundle.ts`, which fails the build if either library appears in the first-load bundle.

| Bundle (minified) | Size | gzip |
|---|---|---|
| First load (timer + picker) JS | 241 kB (was 237 kB) | 75.9 kB (was 74.7 kB) |
| 6K mode chunk (lazy) | 31 kB | 11 kB |
| Daily Dashboard chunk (lazy) | 15 kB + 2 kB CSS | 6 kB |
| MapLibre + PMTiles chunk (lazy) | 1,088 kB | 298 kB |
| MapLibre worker (lazy) | 519 kB | |
| Street map file (saved on demand, not precached) | 9.9 MB | |

The service worker precaches the lazy chunks too (about 2.6 MB instead of 0.6 MB), so the 6K mode works offline even if it was never opened online. The map libraries sit in their own vendor chunk, so app updates that don't touch them don't download them again.

```
src/
  Root.tsx                Mode picker (always the first screen); lazy-loads the 6K mode and dashboard
  App.tsx                 The ACR timer (unchanged, plus "Switch mode" in Settings)
  timer/engine.ts         Pure timestamp-based interval logic (no clocks, no React)
  timer/clock.ts          Monotonic session clock with sleep correction
  nav/                    Pure route following: geo, route, tracker, banner, constants
  sixk/                   6K mode: library, route page, follow view, hooks, styles
  sixk/map/               MapLibre map, brand style, offline map file (lazy)
  weather/                Pure: GEM request/parsing, outfit rules, run time, cache
  dashboard/              Daily Dashboard UI, useForecast, dressed duck (dashboard/duck/) (lazy)
  advisories/             Pure notice filtering/validation and the shared NoticeList
  assets/duck-outfit/     Duck base drawing + one SVG per outfit item (drafts; see its README)
  data/advisories.json    Hand-edited notices (changed by pull request)
  data/routes/            Processed routes (JSON + GeoJSON + manifest), hand-editable
  hooks/                  useIntervalTimer, useWakeLock, useGeolocation
  lib/cues.ts             Beeps and vibration (timer and route cues)
  lib/prefs.ts            localStorage preferences
  components/             TimerDisplay, EditPanel, MenuSheet, ModePicker
routes/                   Source GPX, routes.config.json, cached lookups
scripts/                  build-routes, cut-map, check-bundle, dev-cert
public/maps/              montreal.pmtiles and label glyphs
```

### Timing design

The timer never counts down by subtracting 1 every tick. While a session is active it stores only the moment the current interval ends (`endsAt`), and the remaining time is always `endsAt − now`. Ticks (every 250 ms) only refresh the screen, so late or throttled ticks cause no drift. Each new interval starts exactly where the previous one ended, not when the tick happened to run.

`now` comes from `performance.now()`, which is monotonic, so changing the phone's clock or time zone doesn't affect the timer. Some phones stop that clock while the device sleeps, so it is cross-checked against `Date.now()`, and any sleep gap over 1 s is added back. When the page becomes visible again, the engine applies every interval boundary that passed while it was hidden and shows the correct phase. Missed beeps are **not** replayed. A cue only plays for a change that happened in the last 2 seconds while the page was visible.

## Local development

You need Node.js 22.18+ (CI uses the current LTS). The scripts in `scripts/` are TypeScript run directly by Node, `npm run build` included.

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
| `npm run build` | Type-check, build the production site into `dist/`, and check the first-load bundle |
| `npm run preview` | Serve `dist/` at the GitHub Pages path for testing |
| `npm run routes` | Rebuild processed routes from `routes/*.gpx` |
| `npm run map` | Re-cut the street map extract |
| `npm run dev:https` | Dev server over HTTPS on your Wi-Fi (for GPS on a phone) |
| `npm run preview:https` | Production build over HTTPS on your Wi-Fi |

### Testing on a phone (GPS needs HTTPS)

Browsers only give GPS to secure (https) pages. A phone loading `http://<laptop-ip>:5173` gets **no GPS**. Two ways round it:

1. **A tunnel (most reliable; the service worker works too).** Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (a separate program, not an npm package), run `npm run dev` (or `npm run build && npm run preview`), then in another terminal:

   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```

   Open the printed `https://….trycloudflare.com/anyoneCanPace/` on the phone (use port 4173 for preview). `ngrok http 5173` works the same way. `vite.config.ts` already allows these hosts. The tunnel URL is public while it runs, so stop it when you're done.
2. **Self-signed HTTPS on your Wi-Fi.** `npm run dev:https` makes a certificate with `openssl` (in `.cache/dev-cert/`, nothing installed) and prints `https://<laptop-ip>:5173/anyoneCanPace/`. The phone warns about the certificate once: tap through ("Show details → visit this website" on iPhone, "Advanced → Proceed" on Android). GPS works after that. Browsers refuse service workers on a self-signed certificate, so test offline behaviour with the tunnel or on the deployed site.

Service workers only register in `npm run preview` (or `preview:https`), not in dev. Wake lock and installing also need HTTPS.

## Deploying to GitHub Pages

Deployment is automatic: `.github/workflows/deploy.yml` type-checks, tests, builds and deploys on every push to `main`. You can also run it by hand from the **Actions** tab. It does **not** run on pull requests or other branches, so run `npm test`, `npm run typecheck` and `npm run build` locally before merging.

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
- **GPS only works in the foreground.** Locking the phone or switching apps stops location updates; the 6K follow view says so before you start. When you come back, progress catches up from the next fix (within a forward limit), and turns you passed meanwhile are skipped, not replayed.
- **GPS accuracy** in downtown streets is often 10–30 m. Off route needs more than ~30 m for ~5 s, and fixes worse than 60 m are ignored for progress, so expect the occasional late or early cue near tall buildings.
- **The map needs WebGL.** On the rare phone without it, the 6K mode still shows directions and distances, just no map.
- **The weather is for central Montréal**, an hourly model forecast, not a reading outside your door. Glance outside too.
- **Cache Storage can be cleared** by the browser when the phone is low on space (more likely on iPhone if the app isn't installed). The library then shows "not saved" again. Installing the app to the home screen helps.

## Typography and licensing

The design reference was **Spacilo Mono** by RagamKata Studio. Its free download is a demo for personal use only with a limited character set. Using it on a public website needs a paid webfont license (and an app license for an installed app). So the app uses an openly licensed alternative.

Three openly licensed fonts were compared: **JetBrains Mono**, **Space Mono** and **Martian Mono**, all under SIL OFL 1.1. **JetBrains Mono** is the closest match. Like Spacilo, it has rounded-square bowls, a tall x-height and clean neo-grotesque shapes, and its variable weights go up to 800 for the heavy RUN/WALK label. Space Mono is rounder and more retro, and Martian Mono is wider and chunkier.

- **JetBrains Mono** © 2020 The JetBrains Mono Project Authors, licensed under the [SIL Open Font License 1.1](src/assets/fonts/JetBrainsMono-OFL.txt).
- Self-hosted WOFF2 files (Latin and Latin Extended subsets) are in `src/assets/fonts/` and precached for offline use.

## Beta channel (testing on a phone before release)

The live app at `/anyoneCanPace/` only changes when `main` is pushed. Unreleased work can be tried on a phone from a separate **beta** repository, [ShereenElaidi/anyoneCanPace-beta](https://github.com/ShereenElaidi/anyoneCanPace-beta), served at **https://shereenelaidi.github.io/anyoneCanPace-beta/**.

- It is the same code. A repository name containing "beta" makes the build say **Beta**: the BETA tag on the picker, "AnyoneCanPace Beta" as the tab title and home-screen name, and "ACP Beta" as the short name.
- It has its own path, so its service worker, cached files and update prompts never touch the live app. A beta nested inside the live path (`/anyoneCanPace/beta/`) would be caught by the live app's service worker, which is why it's a separate repository.
- Both apps are on the same `github.io` site, so on one phone they share local storage: timer intervals and the forecast. The live app ignores the keys it doesn't know.
- To update the beta from a feature branch (this deploys it via its own copy of the workflow):

  ```bash
  git push beta feature/dressed-duck-advisories:main
  ```

  Use whichever branch is current. Never push the beta remote's history back to `origin`.

## Map, data and font credits

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Vector tiles from the [Protomaps](https://protomaps.com) basemap build.
- The sample route was drawn with [On The Go Map](https://onthegomap.com).
- Elevation: Natural Resources Canada, Canadian Digital Elevation Model, used at build time only. Contains information licensed under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).
- Map label font: Noto Sans © The Noto Project Authors, SIL OFL 1.1 (`public/maps/fonts/OFL.txt`).
- MapLibre GL JS (BSD-3-Clause) and PMTiles (BSD-3-Clause).
- Weather: [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0), from Environment and Climate Change Canada's GEM model.

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
- [ ] **Duck:** the running duck is visible and sits on the end of the gold arc on both RUN and WALK, including at 15 s intervals and in the installed app (iPhone Safari too).
- [ ] **Battery:** note battery use over a 45-minute session with the screen on.
- [ ] **Offline:** start a session in airplane mode after one earlier visit.
- [ ] **Install:** add to home screen on iOS and Android. The icon, name, standalone display and portrait layout all look right.

### Dressed duck and advisories: check

- [ ] **The duck matches the list:** for a few run times (morning, evening, a rainy hour) the duck wears what the text says. Rain or snow falls behind it only when the list mentions rain or snow.
- [ ] **Reduced motion:** with the phone's "Reduce motion" on (iPhone: Settings → Accessibility → Motion), the falling rain or snow is gone.
- [ ] **Readable without the duck:** cover the duck with your thumb. The advice still makes complete sense.
- [ ] **A notice:** add a test notice for a route in `src/data/advisories.json` with tomorrow as `start`. It doesn't show today, shows tomorrow, and disappears the day after its `end`.

### Daily Dashboard: field check

- [ ] **First open online:** "Updated <time>" and an outfit appear within a few seconds. The run time defaults to the next 10 a.m.
- [ ] **Run time:** it defaults to the next 10 a.m. Pick tonight and tomorrow morning: the outfit changes (reflective vest when it's dark).
- [ ] **Offline:** in airplane mode, reopen. It shows "Offline: showing the forecast from …" and the same outfit. With storage cleared and offline, it shows "Check outside".
- [ ] **Does the outfit match reality?** For a week of runs, note the run feel, what the app said and what you actually wore. Tune `RUN_FEEL_OFFSET_C` and the tiers.
- [ ] **Readable** at arm's length outdoors. The list makes sense without the duck.
- [ ] **No location prompt** ever appears on the dashboard.

### 6K Route Library: field test on the real loop

Take a charged phone outside to walk or jog the sample loop, after one online visit. Use the deployed site or a tunnel, not plain http.

- [ ] **Offline map:** the library says "Map saved for offline use". In airplane mode the route page and follow view still show streets and labels.
- [ ] **GPS permission:** the first START ROUTE asks for location. If you refuse, the banner says how to allow it.
- [ ] **Approach:** from about 500 m away the banner says "Head to the start: N m" and the arrow and compass word point the right way on the north-up map. Within about 250 m it says "You're at the start".
- [ ] **Start anyway:** start the route mid-way. Progress begins where you are, and earlier turns don't buzz.
- [ ] **Turn cues:** every turn gives a heads-up at about 150 m and "now" at about 30 m, once each. Left is one buzz, right two, U-turn long (Android). With Sound on, the beeps match (iPhone too).
- [ ] **Turn list accuracy:** note every turn that is missing, extra, in the wrong direction or has the wrong street, then fix them in `src/data/routes/sample-loop.json`. Start with the lines marked "yes" in `routes/review/sample-loop.md`: where the route really starts (the first 46 m have no street name), the dogleg at the Rue Mill junction on Rue de la Commune (2.15 and 2.23 km), the bend at 2.52 km and the Peel/Sherbrooke corner.
- [ ] **Forward only:** stand still for a minute and walk on both sides of the street. The duck never goes backwards and the km done never drops.
- [ ] **Start/finish ambiguity:** at the start, walk back and forth between the start and finish (37 m apart) before leaving. It must not say Finished.
- [ ] **Off route:** walk one block off the route. Within about 5–10 s you see the dashed banner, the confused duck with its "?", a buzz and "Going rogue?". "No" keeps guiding you back, "Yes" calms it, and returning to the route clears it.
- [ ] **GPS gap:** lock the phone for a minute while walking past a turn, then unlock. The duck jumps ahead, with no burst of old buzzes.
- [ ] **Finish:** "Finished!" appears at the finish, not before about 90 % of the distance.
- [ ] **Readability:** the banner is readable at arm's length in sunlight while jogging. The thick navy route and the dashed gold "covered" line are easy to tell apart.
- [ ] **Wake lock:** the screen stays on for the whole loop (about 40–60 minutes). Note battery use.
- [ ] **Back gesture:** mid-route, the phone's back gesture opens the route menu instead of leaving. END ROUTE needs two taps.
- [ ] **Accidental taps:** with the unlocked phone in a pocket for a minute, nothing ends.
- [ ] **Screen reader (optional):** VoiceOver or TalkBack announces turns, off route and finished, not every metre.

## V2 To-Do List
- [ ] **Lockscreen:** Somehow allow it to be controlled by the lockscreen without needing to put it on App Store / GPlay store. To allow for vibration cues & allow app to be used while locked.
