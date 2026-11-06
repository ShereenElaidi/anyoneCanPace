# Prompt for the implementation chat (paste everything below the line)

---

You are implementing a large extension to **AnyoneCanPace**, an existing, working, deployed PWA. Read `CLAUDE.md` and `README.md` first, and read the existing code under `src/` before planning. Do not skim: the rules in `CLAUDE.md` are binding unless this prompt explicitly carves out an exception.

## Background

AnyoneCanPace is a RUN/WALK interval timer for volunteer pacers of **AnyoneCanRun (ACR)** by Les Stooopids, in Montréal. Volunteers use the live timer on event mornings, so **it must not regress**. We now want to turn the app into three modes behind a mode picker:

1. **ACR Run/Walk Timer**: the existing timer, unchanged in behaviour.
2. **6K Route Library**: a library of 6 km routes. Pacers pick a route, then follow it with a street map, live GPS, a direction banner and the duck as their location marker. **No timer** in this mode.
3. **Daily Dashboard**: today's weather and what to wear for running, shown with a duck dressed for it.

The work is split into three **stages**. Each stage is usable alone. **Stage N+1 depends on how the user fine-tunes Stage N, so you must stop at the end of each stage and wait.** Never start the next stage on your own.

## Hard process rules

- Work on a **feature branch**, never on `main`. Stage 1: `feature/6k-route-library`. Stage 2: branch from the Stage 1 branch as `feature/daily-dashboard`. Stage 3: branch from the Stage 2 branch as `feature/dressed-duck-advisories`.
- **Never merge anything, never merge into `main`, never open or merge a PR, never push without asking.** The user will merge when satisfied. Committing locally is fine and encouraged: small, focused commits.
- **Ask before pushing**, as `CLAUDE.md` says. Pushing `main` triggers the deploy workflow, so nothing from this work may reach `main` except by the user's own merge.
- Before every commit run `npm test`, `npm run typecheck` and `npm run build`. Do not commit with any of them failing.
- Do not change the timer engine (`src/timer/`) or the timer behaviour. If you believe a change there is needed, stop and ask.
- Pure logic goes in pure modules with unit tests, in the style of `src/timer/engine.ts` (no clocks, no React, no DOM, no `navigator`). Hooks and components wrap them.
- Update `CLAUDE.md` and `README.md` as the work lands: layout, new rules, privacy statements, limitations, and the amended dependency rule below.
- At the end of each stage: summarise what you built, list decisions you made that the user didn't specify, give test and build results, give a **field-test checklist** for a real walk, list known limitations, then **stop and wait**.
- If you hit a decision that is genuinely the user's call, ask a short question. Otherwise pick the sensible default, state it, and keep going.

## Amended rule: dependencies

`CLAUDE.md` says "No new heavy dependencies". Exception, scoped to this work:

- **MapLibre GL JS** and the **PMTiles** reader are allowed, for the 6K mode only.
- They must be **lazy-loaded** (dynamic import / code-splitting) so the ACR timer's first load is not affected. Add a check that the main chunk does not include them, and record the chunk sizes in your stage summary.
- No state libraries, UI kits, analytics, or tracking. Build-time-only dev dependencies for the route script are fine (for example a GPX parser or geometry helper), but justify each.
- Update the rule in `CLAUDE.md` to state this exception.

## Privacy and offline principles (keep, and document in the README)

- No backend, accounts, analytics or tracking.
- GPS position stays on the device. Never send, log or store it anywhere except in memory for the current session.
- The only outbound request the app makes at runtime (besides loading itself) is the weather request in Stage 2, with **fixed Montréal coordinates**, not the user's location. Say so in the README.
- Routes, stats, the map file and the last-known weather must work offline once cached. Show "last updated" times for anything that can be stale.
- Do not replay missed cues. Do not auto-reload the app mid-session (the existing service-worker rule still holds).

## Brand and accessibility (unchanged, and they apply to new screens)

- Brand colours and fonts as in `CLAUDE.md`. Touch targets ≥ 44 px. Meaning is never conveyed by colour alone. Respect reduced motion. Announce changes (a new turn, off route, finished), not every tick.
- The duck is the project mascot (`design/duck-mascot.webp`; the running duck already rides the timer's progress ring). In the 6K mode, **the duck is the map marker for the pacer's current position, and there is no progress ring**.

---

## STAGE 1: Mode picker + 6K Route Library (baseline)

### 1. Mode picker
- Home shows the mode picker. In Stage 1, "ACR Run/Walk Timer" and "6K Route Library" are active; "Daily Dashboard" appears as disabled/"coming soon" or is hidden (your call, state it).
- Remember the last-used mode in `src/lib/prefs.ts` and open straight into it, so existing timer users don't gain a tap. Provide an obvious way back to the picker that cannot be triggered accidentally mid-session (follow the spirit of the "Reset/End stays in Settings behind a two-tap confirm" rule).
- ACR mode must behave exactly as it does today. All existing tests must keep passing untouched.

### 2. Route data and the build script
- Routes live in the repo as source GPX under a `routes/` (or similar) folder, and a **Node build script** (`scripts/`) converts each GPX into a small processed JSON/GeoJSON file plus a manifest, committed to the repo and cached by the service worker.
- The first sample route is already in the repo at `routes/onthegomap-6.4-km-route.gpx` (an On The Go Map export; keep its OpenStreetMap / On The Go Map attribution). Source GPX files stay in `routes/` and are committed (the repo is public and the route is a public course); only the processed route JSON is shipped to the app, never the raw GPX. What we measured about it:
  - 345 points, about 6,429 m. **No elevation** (`<ele>` is absent).
  - It is a **loop**: first and last points are about 37 m apart.
  - It has about 3 tiny **dead-end spurs** (a few metres out and back) from the routing tool.
  - Bounding box: lat 45.493 to 45.51216, lon -73.57658 to -73.5527.
- The script must:
  - Parse the GPX; remove spurs and duplicate/near-duplicate points; simplify (about 5 m tolerance) while keeping turn geometry.
  - Compute total distance, a cumulative-distance array, bounding box, loop/out-and-back/point-to-point classification.
  - **Elevation**: since the file has none, look it up at build time (the Open-Meteo elevation API is one option; verify it, or choose another free DEM source and say which). Smooth the profile and ignore changes under about 3 m before summing, to get realistic **gain and loss**, plus min/max elevation. Cache the lookup result so builds are repeatable offline.
  - **Propose turns** automatically from bearing changes (ignore gentle curves; ignore the removed spurs), producing a turn list the user then edits by hand.
  - Emit the route JSON with this shape (extend sensibly, but keep `advisories` from day one):
    ```json
    {
      "id": "sample-loop",
      "name": "Sample Loop",
      "kind": "loop",
      "stats": { "distanceM": 6429, "gainM": 0, "lossM": 0, "minEleM": 0, "maxEleM": 0 },
      "track": "sample-loop.geojson",
      "turns": [
        { "atM": 410, "dir": "left", "street": "rue Rachel", "note": "Cross at the light" }
      ],
      "notes": [],
      "advisories": []
    }
    ```
  - Street names for turns can be filled from the OSM-based tiles/data where practical, otherwise left blank for the user to edit in the JSON. The user edits **plain JSON files by hand** for now; no editing UI.
- Credit "© OpenStreetMap contributors" (and On The Go Map where the route came from it) in the UI.

### 3. Street map from day one (PMTiles + MapLibre)
- Use **self-hosted PMTiles** vector tiles with MapLibre GL JS. Cut the extract with the `pmtiles extract` CLI from the Protomaps public build, using a bounding box that covers the sample route with a generous buffer. Start small (a few MB) and make the script/docs able to re-cut a larger area (e.g. the whole island) later. Measure and report file size.
- **Street-name labels need glyph (font) files and any sprites hosted with the app**, or labels fail offline. Self-host them.
- Style the map to the brand (Pavement background, Asphalt roads, Track Blue water; keep the route line high-contrast and thick enough to read while running; use a pattern/width difference, not colour alone, for "covered" vs "remaining").
- Offline: provide a reliable way to have the whole map file available offline (download once and cache it) rather than relying on range-request caching. Show the offline state honestly.

### 4. Library UI
- **Library list**: name, distance, gain/loss, small outline thumbnail (inline SVG from the track).
- **Route page**: map preview, stats, elevation profile as a small inline SVG (no chart library), turn list, notes, an empty-state advisories section, and a **Start route** button.
- Plain, big, glanceable text. Accessible, as above.

### 5. Follow view (live navigation)
- Map with the route line, the **duck at the pacer's route-progress position**, and a small dot with an accuracy halo for the raw GPS fix. The duck faces the direction of travel (flip the sprite by route bearing).
- **Direction banner** at the top: arrow icon + text, always with text ("Left on rue X in 150 m"), plus a "Continue on X for 1.2 km" line between turns.
- A single plain-text stats line: "3.2 km done · 2.8 km to go".
- **No timer, no progress ring.**
- Keep the screen awake with the existing wake-lock hook (foreground GPS only; document that backgrounding or locking the screen stops tracking, and tell the user in-app in a brief, non-alarming way).

### 6. Pure logic module(s) (the heart; test them heavily)
- **Forward-only progress tracking**: progress along the route only moves forward; never snap to the globally nearest point, because routes can overlap themselves and because the sample is a loop whose start and end are about 37 m apart. Tolerate GPS jitter; allow bounded forward jumps.
- **Start handling**: be very flexible about where the pacer begins. "At the start" is a generous radius (about 250 m) around the route's first point, there is always a **"Start anyway"** button, and before starting the app shows "Head to the start: N m" with a bearing arrow. Progress initialises from the closest point within the early part of the route.
- **Cues**: fixed distances: heads-up at about **150 m** before a turn, "now" at about **30 m**. Each fires **once** per turn, driven by route progress. If the pacer has already passed a turn (GPS gap), skip it silently (don't replay missed cues). Delivery: banner + vibration with distinct patterns (one pulse left, two right, long for U-turn), via the existing `src/lib/cues.ts` conventions; announce turns (not distance ticks) to screen readers via an `aria-live` region. Spoken cues are out of scope.
- **Off route**: more than about 30 m from the route for about 5 s → off-route state: "?" badge on the duck, text, vibration, and the banner points toward the nearest forward point. Recover cleanly when back on route.
- **Finish**: for loops and routes generally, finished triggers near the last point only after most of the distance (about 90 %) is covered.
- Constants (150, 30, 250, 5 s, 30 m, 90 %) are named and in one place so they're easy to tune.

### 7. Tests
- Vitest unit tests for the pure modules using **recorded/synthetic GPX tracks replayed point by point**: a clean run of the sample loop, a jittery run, an off-route detour and recovery, a late joiner starting mid-way, a GPS gap that skips a turn, start/finish ambiguity on the loop.
- Tests for the build script's outputs (spur removal, distance, elevation smoothing, turn proposals).
- UI tests in the style of `App.test.tsx` for the picker (including that ACR still works unchanged) and the library list/route page. Mock the geolocation and MapLibre at the boundary.
- A written **field-test checklist** for walking the real loop.
- Note for testing on a phone: the Geolocation API needs a **secure context**. A phone loading `http://<laptop-ip>` will NOT get GPS. Document a workable approach (a tunnel such as Cloudflare Tunnel or ngrok, or a local HTTPS dev server) and set it up as a documented script/instructions, without adding heavy dependencies. Service workers only register in `npm run preview`, not dev.
- Check whether `.github/workflows/deploy.yml` runs on pull requests or only on pushes to `main`. Don't modify workflow files without asking (pushing workflow changes needs the `workflow` scope).

### Stage 1 done means
Picker works; ACR is untouched and its tests pass; one sample route renders on a real street map offline; the follow view tracks forward-only with a duck, turn cues, off-route handling and finish; everything tested and documented; bundle impact reported; branch committed locally, **not merged, not pushed**. Then stop and wait for the user's field test and tuning.

---

## STAGE 2: Daily Dashboard (start only when the user says so)

Branch from the Stage 1 branch. Before starting, ask the user what they changed or learned from the Stage 1 field test and adjust.

- Third mode **"Daily Dashboard"**: today's weather and what to wear for running.
- **Weather source: Open-Meteo's Environment Canada GEM endpoint**, `https://api.open-meteo.com/v1/gem`, which returns hourly numbers (apparent temperature, precipitation probability/amount, wind, UV, and so on) and works from the browser (CORS is open; verified). Use **fixed Montréal coordinates**, never the user's location. Free tier is non-commercial, CC-BY: show attribution ("Weather data by Open-Meteo.com", and the Environment Canada source where required), and keep requests minimal (fetch on open, cache in `localStorage` or the service worker, show "updated at", fall back to the last known data when offline, and to "check outside" if there is none).
- A **time-of-run picker** (default: the next sensible hour; allow the user to choose the event start time) so the outfit reflects the forecast for that hour.
- **What to wear** as a **pure, tested function**: input = weather at the run hour (+ sunrise/sunset); output = a list of outfit items, a headline, and notes. Principle: **dress for the "run feel", not the weather**. Run feel = feels-like temperature plus an offset (start at about **+7 °C**, a named constant, because pacers run/walk intervals and stand around before the start; the offset is meant to be tuned). Starting-point tiers on run feel: ≥ 25: singlet, shorts, cap, sunglasses; 18-25: tee, shorts, cap; 10-18: tee or light long sleeve, shorts; 3-10: long sleeve, tights, light gloves; -4-3: long sleeve + light jacket, tights, gloves, headband; < -4: thermal layers, windproof shell, toque, mittens, neck warmer. Modifiers: rain → raincoat + cap brim; strong wind → windbreaker; high UV → sunglasses/sunscreen note; snow/ice → grippy shoes and a slippery-surface note; dark at run time → reflective vest/headlamp; a "bring an extra layer for the wait at the start" note. These numbers are starting points; make them easy to change in one table and cover the tiers and modifiers with tests.
- The outfit is always shown **as text** too. Meaning never depends on the duck alone.
- In Stage 2 the duck can be shown simply (undressed or with a placeholder); the full dressed duck is Stage 3. The dashboard layout should leave a clear slot for it.
- Update README (privacy: the one outbound weather request) and `CLAUDE.md`.
- Tests: outfit function tiers/modifiers; weather parsing with recorded fixtures; offline/stale fallbacks; the dashboard UI with the network mocked.
- Stop at the end of the stage with the same summary, field-check list and decisions list, and wait.

---

## STAGE 3: Dressed duck + advisories (start only when the user says so)

Branch from the Stage 2 branch. First ask what the user changed or learned from Stage 2.

### Dressed duck
- Draft **simple SVG overlay pieces** that fit the mascot's pose in `design/duck-mascot.webp`: head layer (toque, cap, headband, sunglasses), body layer (tee, long sleeve, light jacket, windbreaker, raincoat, thermal shell), accessories (gloves/mittens, neck warmer, reflective vest). The user will refine the art later, so keep them clearly separable, in the brand palette, with a simple documented way to swap each piece for a better drawing.
- Compose the duck from the outfit function's item list. The duck is decorative and hidden from assistive tech, while the text outfit list carries the meaning.
- Optional light weather flourish (falling rain/snow around the duck) that turns off for reduced motion.

### Advisories
- Start with **manual notices**: a hand-edited JSON file the crew changes by pull request (route id or global, text, optional km range, start/end dates, source link). Show them on the route page and on the dashboard, with a "last checked" date, and make expired notices disappear.
- Then, **only if the user agrees after you verify the data source**, a daily scheduled GitHub Action that fetches Montréal's road works/closures open data (and optionally Québec 511), buffers each route (about 25 m) and flags intersecting closures into a static conditions file published with the site. Before building it: find the real, current dataset endpoints and licences, check how noisy the data is (sidewalk work, lane closures), and report. Warn about its limits: stale or incomplete data, scheduled workflows may be delayed or disabled after about 60 days of repo inactivity, and flagged items are "possible" only, with a link to the source. Don't change workflow files or push them without asking.
- Environment Canada weather warnings could be added later to the same advisories surface; leave a clear extension point but don't build it now.
- Tests for notice filtering/expiry, closure-to-route matching, and the UI. Update docs.
- Stop with the usual summary and wait.

---

## How to begin

1. Read `CLAUDE.md`, `README.md`, and the existing `src/` code. Check the git status (an untracked `AGENTS.md` is not yours; leave it alone).
2. Create the Stage 1 branch.
3. Post a **short plan** for Stage 1 with the order you'll build things, the files you'll add, and any questions that truly block you. Then begin. Build the pure logic and the build script first (they're the riskiest), with tests, then the map, then the UI.
4. Commit locally as you go. Don't push. Don't merge.
