# Route editor (dev only): plan

A page at `/anyoneCanPace/?edit` on `npm run dev` for adding routes and editing what is written by hand today: name, place, tags, notes, turns, advisories and verification. It writes the same files that are hand-edited now, and you review and commit them as usual. It never ships to users, and nothing about how routes are built or checked changes.

## What it replaces

| Today | In the editor |
|---|---|
| Copy the GPX into `routes/`, add an entry to `routes.config.json` | Drop in a GPX, fill in name and source, press **Add** |
| `npm run routes` in a terminal | Runs automatically after add or save, with the log shown on the page |
| Edit `src/data/routes/<id>.json` by hand | Form: name, place, description, tag chips, notes, start street |
| Read `routes/review/<id>.md`, fix turns in JSON | Turn list next to a map: click a turn to see it, change direction, street or note, delete it, or click the track to add one |
| Write `"verification": {…}` by hand | A separate Verification panel (see "Guardrails") |
| `?sim=<id>` typed by hand | **Try in simulator** link |

## How it fits together

```
browser (?edit, dev only)  ──fetch──▶  Vite dev-server plugin (apply: 'serve')
  src/dev/routeEditor/*                 scripts/route-editor-plugin.ts
                                          ├─ GET  /__route-editor/routes        list + review JSON
                                          ├─ POST /__route-editor/routes        upload GPX + config entry
                                          ├─ PUT  /__route-editor/routes/:id    save hand-edited fields
                                          └─ POST /__route-editor/build         run build-routes.ts, stream log
                                        writes: routes/*.gpx, routes.config.json, src/data/routes/<id>.json
```

- **Loaded like `?sim`.** `main.tsx` lazy-imports `src/dev/routeEditor/` only when `import.meta.env.DEV && params.has('edit')`, so the production build drops it.
- **The plugin uses `apply: 'serve'`**, so it doesn't exist in `vite build` or `vite preview`.
- **Builds use the existing script.** The plugin spawns `node scripts/build-routes.ts` (plus `--offline` for saves that only change text), so there is one pipeline and every rule it enforces still holds: stale turns, verification reset, kept hand edits.
- **Saves are partial.** `PUT` only accepts the hand-edited fields (`name`, `place`, `description`, `tags`, `notes`, `startStreet`, `turns`, `advisories`, `verification`). The server merges them into the existing file and never writes `stats`, `profile`, `bbox` or `geometry`.

## Guardrails

- **Local only.** `npm run dev:https` uses `--host`, and tunnels are allowed, so a write endpoint could be reached from the LAN or the internet. The plugin rejects any request that doesn't come from a loopback address, and any request whose `Origin` isn't the dev server's own.
- **GPX is cleaned before it's saved.** The repo is public and the raw GPX is committed. The server rewrites the upload as a minimal GPX with only `trkpt lat/lon/ele`, dropping `<time>`, heart rate, cadence, `<extensions>`, `<metadata>` and author. The page also asks you to confirm the start and finish are public places, not someone's home.
- **Verification stays deliberate.**
  - Uploads are always `unverified` (the build already does this).
  - Saving changed turns resets the status to `unverified`, matching README step 5. Today that only happens through the build when the geometry changes.
  - Setting `desk-reviewed` or `field-verified` happens in its own panel, needs reviewer and date (no future dates), and shows the exact line to add to the reviewed list in `src/nav/verification.test.ts`. The editor doesn't edit that test, so the review stays a visible change in the PR.
- **Geometry changes.** Replacing a route's GPX re-runs the build. If it stops because turns are stale, the page explains why and offers **Rebuild with fresh turns** (`--reset-turns`), listing old turns that matched nothing.
- **Validation is shared.** It reuses `validateTags` (`describe.ts`), advisory validation (`advisories/notices.ts`) and turn checks (sorted `atM`, inside the route length, known `dir`). Nothing is written until validation passes.
- **Map coverage.** If the route's bbox falls outside `montreal.pmtiles`, a warning says to run `npm run map` and bump `MAP_VERSION`. The editor doesn't run it (slow, large download).
- **Bundle check.** `scripts/check-bundle.ts` fails if `__route-editor` appears in any production chunk.

## Code

| File | What |
|---|---|
| `scripts/lib/json.ts` | `formatJson` moved out of `build-routes.ts` so the plugin writes the same format (keeps diffs clean) |
| `scripts/lib/sanitize-gpx.ts` | Pure: GPX string → minimal GPX. Tested with a watch export (time, HR, extensions) |
| `scripts/lib/route-edits.ts` | Pure: slug from name, merge of editable fields, validation, turn-change → unverified. Tested |
| `scripts/route-editor-plugin.ts` | Middleware. Handlers take the repo root as a parameter, so tests run against a temp folder |
| `src/dev/routeEditor/` | `RouteEditor.tsx` (list + add), `RouteForm.tsx` (details), `TurnEditor.tsx` (list + map), `VerificationPanel.tsx`, `editor.css` |
| `src/main.tsx` | One more dev-only branch next to `?sim` |
| `vite.config.ts` | Register the plugin |

The turn map reuses MapLibre and the PMTiles file the app already ships, with plain markers. Clicking the track to add a turn projects the click onto the route with `nav/geo` to get `atM`. Nothing new to install.

## Route description (decided: add it)

A new optional `description` on each route: a short paragraph about what the route is like ("Flat along the canal, shaded most of the way, one busy crossing at Atwater"). Written by hand, like `place`.

- **Data:** `description?: string` on `RouteData` (`src/nav/types.ts`). Plain text, no Markdown, trimmed, at most 280 characters, so it stays a quick read on a phone.
- **Build:** `build-routes.ts` keeps it like `place` and `tags` (`...(keep && existing!.description !== undefined ? {...} : {})`) and the header comment lists it among the hand-edited fields. It does **not** go into `manifest.json`: library cards are compact on purpose, and the description is only for the route page.
- **Route page:** `RoutePage.tsx` shows it as a paragraph under the title, above the stats (distance, climb, descent). Hidden when empty. Notes stay where they are, lower down, for practical points (water, toilets, crossings).
- **Validation:** a pure `validateDescription` in `describe.ts` (string, not blank, ≤ 280), checked against every real route file by the existing route test, and reused by the editor.
- **Tests:** `RoutePage` shows the description when set and nothing when not; the build keeps a hand-written description across a rebuild (same as `place`).
- **Existing routes:** none get one automatically. Sample Loop, Pi Day and Canal Test get theirs written in the editor (or by hand), not made up by the build.

This lands as its own commit before the editor, so it's useful even without the editor.

## New tags (decided: the editor can add them)

Tags are code today: `ROUTE_TAGS` in `src/sixk/describe.ts` (id → label + tone), drawn on library cards as `tag tag--<tone>`. Two of them (`shape-run`, `good-first-route`) are also "Show routes" filters (`FILTERS`, same file). For the editor to add tags without rewriting TypeScript, the list moves to a data file.

- **Data file:** `src/data/route-tags.json`, `{ "waterfront": { "label": "Waterfront", "tone": "gold" }, … }`. `describe.ts` imports it and keeps exporting `ROUTE_TAGS`, so `Library.tsx` and `validateTags` don't change. Same four tags, same order.
- **Colours stay fixed.** A new tag picks one of the existing tones (`gold`, `green`, `blue`), which are already styled and contrast-checked in `sixk.css`. The editor shows a preview chip. A new colour is still a CSS change made by hand.
- **Adding:** in the Details form, a **New tag** field next to the tag chips: type a label, pick a tone, see the preview. The id is made from the label (`Hill repeats` → `hill-repeats`) and never changes after that, because route files refer to it.
- **Rules** (pure `validateTagList` in `describe.ts`, run on the real file by a test and by the editor before writing):
  - ids are lowercase kebab-case and unique
  - labels are 1–24 characters, unique ignoring case (no "Waterfront" and "waterfront")
  - tone is one of the known tones
- **Renaming** a tag changes its label only, and every route shows the new label.
- **Deleting** a tag is only offered when no route uses it. Otherwise the editor lists the routes to untag first.
- **Filters are separate.** A new tag shows on cards but doesn't become a "Show routes" filter. Adding a filter is still a code change in `FILTERS`, because it changes the library's layout.
- **Server:** one more endpoint, `PUT /__route-editor/tags`, with the same loopback guard and validation, writing `route-tags.json` with `formatJson`.

This also lands before the editor (step 0b): moving the list to JSON with no change in behaviour.

## Route sources (decided: On The Go Map, Strava, Garmin, Other)

Each route's `source` (`{ name, url?, attribution }`) fills the credit line on the route page (`RoutePage.tsx`), which then adds "Map data © OpenStreetMap contributors…" itself. So the source line only needs to credit where the route came from.

| Preset | `name` | `url` | `attribution` |
|---|---|---|---|
| On The Go Map | On The Go Map | https://onthegomap.com | Route drawn with On The Go Map · © OpenStreetMap contributors (as today) |
| Strava | Strava | https://www.strava.com | Route from Strava |
| Garmin | Garmin Connect | https://connect.garmin.com | Route from Garmin Connect |
| Other | typed by you | optional, must be https | "Route from <name>", editable |

- **Drawn or recorded?** Add route asks whether the GPX was drawn on a map or recorded on a run. Strava and Garmin exports are often recorded runs, which matters twice:
  - **Privacy:** recorded files carry timestamps, heart rate and cadence. The GPX cleaning (see "Guardrails") removes them for every upload, and the page says what it removed ("Removed 2,140 timestamps and heart-rate data").
  - **Noise:** GPS wobble on a recorded track can show up as fake turns. The pipeline already de-duplicates, removes spurs and simplifies, but the editor flags recorded routes in the turn list ("Recorded track: check turns closely") and keeps that flag in the review report. The answer is saved as `"recorded": true` on the route's entry in `routes.config.json` (build-time only, not shipped).
- **Presets live in the editor only** (`src/dev/routeEditor/sources.ts`), not in the app. The route file stores the full `source` object as today, so a later change to a preset doesn't rewrite old routes.
- **The person who drew the route.** Strava and Garmin routes are often made by a club member. An optional "Drawn by" field adds "drawn by <name>" to the attribution, but only with their OK, and the editor says so next to the field.

## Deleting a route (decided: in v1)

A route is spread over several tracked files, and other code refers to some routes by id, so deleting one is a checked, two-step action, not a single button.

**What it removes** (all tracked in git):
- the entry in `routes/routes.config.json`
- `routes/<gpx>` (only if no other config entry uses the same GPX)
- `src/data/routes/<id>.json` and `<id>.geojson`, then a rebuild of `manifest.json` (`npm run routes -- --offline`)
- `routes/review/<id>.md`, `<id>.json`
- `routes/cache/<id>.*` (elevation, streets, proposed turns)

**Before deleting, the editor checks and shows:**
- **References in code.** It searches `src/` and `scripts/` for the id. Today the three routes are used by tests, the simulator and replay tracks (`verification.test.ts`, `tracker.test.ts`, `nav/testing/replay.ts`, `dev/simulateGps.ts`, `scripts/lib/turns.test.ts`, `elevation.test.ts`, the advisory tests). Deletion is blocked while any remain, with the list of files and lines. Fixing those is a code change made by hand. In practice the three current routes can't be deleted from the editor, and routes added through the editor can.
- **Advisories** in `src/data/advisories.json` that name the route. Also blocked, with the list.
- **Uncommitted changes** to any of the files above (`git status --porcelain`). Blocked, because those changes would be lost for good. With a clean tree, everything removed is still in git history, and `git restore` brings it back until you commit.
- **Verification.** If the route is desk-reviewed or field-verified, the warning says so: that review would have to be done again if the route comes back.

**Confirming:** the page lists every file it will remove, then you type the route's name to confirm (like the app's two-tap End, but harder to do by accident). The server repeats every check itself before removing anything; it doesn't trust the page.

**Not touched:** pacers' phones keep nothing per route (only the library pace), so nothing breaks for them. The offline map isn't re-cut; a smaller map is a separate `npm run map` if you want one.

**Code:** `DELETE /__route-editor/routes/:id` in the plugin, with the same loopback guard, and a pure `planRouteDeletion(id, files, config)` in `scripts/lib/route-edits.ts` that returns the file list and the blockers. Tests run against a temp folder, including "blocked by a reference" and "blocked by uncommitted changes".

## Build order

0. **Route description:** type, build keeps it, route page shows it, validation and tests (see above).
0b. **Tags as data:** `ROUTE_TAGS` moved to `src/data/route-tags.json`, plus `validateTagList` and its test. No visible change.
1. **Groundwork, no behaviour change:** `json.ts`, `sanitize-gpx.ts`, `route-edits.ts` + tests. `npm run routes -- --offline` must produce byte-identical files.
2. **Dev-server plugin:** list, upload, save, build. Loopback/Origin guard. Tests against a temp folder.
3. **Editor page:** route list, Add route (GPX drop, name, id, source preset), Details form, build log.
4. **Turn editor:** turn list with the review candidates ("needs review" flags from `routes/review/<id>.json`), map, edit/delete/add.
5. **Verification panel, advisories, map coverage warning, Try in simulator.**
5b. **Delete route:** checks, confirm by name, server-side re-check (see "Deleting a route").
6. **Docs:** README "Reviewing and releasing a route" and CLAUDE.md commands section.

Each step is a commit on a feature branch; typecheck, test and build before each.

## Questions to settle first

1. ~~**"Describe" has no field yet.**~~ Decided: add `description` (see "Route description").
2. ~~**New tags.**~~ Decided: the editor can add, rename and delete unused tags, using existing colours only (see "New tags").
3. ~~**Source presets.**~~ Decided: On The Go Map, Strava, Garmin, Other, plus "drawn or recorded" (see "Route sources").
4. ~~**Delete a route.**~~ Decided: in v1, with checks (see "Deleting a route").

All questions are settled. Next: build on a feature branch, starting with step 0.
