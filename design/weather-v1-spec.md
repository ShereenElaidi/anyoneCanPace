# Weather Dashboard V1: outfit rules, duck and Sunday story

Status: **draft for review** (2026-11-05). Nothing here is implemented yet.
Each rule is tagged **[approved]** (Shereen's calibration or Round 1/2 answers)
or **[assumed]** (filled in to make the rules complete; change freely).

Scope: one sensible default outfit for an easy 45–60 min community run, the
same for the 6K and ACR run/walk. Not a thermoregulation model. Personal
calibration from one runner; the "Run cold?" lines exist because others differ.

---

## 1. Inputs (forecast)

Source stays Open-Meteo GEM for fixed Montréal coordinates (dashboard rules
unchanged). Changes to the request:

| Change | Why |
|---|---|
| `forecast_days` 2 → 3 | Friday evening can already see Sunday 10:00. **[assumed]** |
| add `past_days=1` | Refreeze warning needs yesterday's precipitation and temperatures. **[assumed]** |
| add `dew_point_2m` | Humidex for heat advice (Environment Canada's index, familiar to Montrealers). **[assumed]** |

Derived, pure functions, unit-tested:

- `T` = `temperature_2m` (air). **Drives every clothing rule.** [approved]
- `windChill(T, wind)` = Environment Canada formula. Used only for the frostbite
  warning and the "feels like" display. Never fed back into clothing. [approved: no double counting]
- `humidex(T, dewPoint)` = Environment Canada formula. Used only for heat. [assumed]
- `rainRate` = `rain + showers` (mm in the hour).
- `wet` = rainRate ≥ 0.3 mm, or a rain / drizzle / freezing / wet-snow code.
  **Chance of precipitation alone never adds clothing**: with ≥ 40 % and 0 mm
  it becomes a note ("40 % chance of a shower"). [assumed]
- Rain intensity: light < 1 mm/h, steady 1–4 mm/h, heavy ≥ 4 mm/h (codes
  65/82 count as heavy). [assumed]
- `wetSnow` = snow falling with −2 ≤ T ≤ 2, or mixed rain and snow. Treated as wet. [assumed thresholds, approved concept]
- `drySnow` = snow falling with T < −2. No clothing change. [approved]
- `freezingRain` = codes 56/57/66/67.
- `windy` = sustained wind ≥ 25 km/h. **Gusts alone no longer trigger** (they
  are shown in details). [approved 25; assumed gusts]
- Missing fields: a missing number is "unknown", never 0. Missing `T` → no
  outfit, "Check outside". Missing wind / precipitation → outfit from `T` only
  plus a note "Wind/rain unknown". [assumed]

## 2. Base outfit by air temperature

Cutoff convention: an item is **required below** its cutoff and **optional**
("Run cold? …") from the cutoff to 2 °C above it, `[C, C+2]` inclusive. Optional items appear in
text only, never on the duck. [approved: Q1–Q3 answers, generalised]

| Item | Required when | Optional ("Run cold?") | Source |
|---|---|---|---|
| Long sleeve instead of tee | T < 12 | 12 ≤ T ≤ 14 | approved cutoff, assumed zone |
| Tights instead of shorts | T < 7 | 7 ≤ T ≤ 9 | approved (Q1) |
| Light jacket | T < 2 | 2 ≤ T ≤ 4 | approved (Q2) |
| Thermal base instead of long sleeve | T < −5 | −5 ≤ T ≤ −3 | approved (Q3) |
| Winter outfit: insulated jacket + windproof shell + winter tights | T < −12 | −12 ≤ T ≤ −10 | approved cutoff, assumed zone |
| Singlet instead of tee | T ≥ 25 or humidex ≥ 30 | – | approved (Q7), threshold assumed |

Resulting defaults:

| T | Default |
|---|---|
| ≥ 25 or humidex ≥ 30 | Singlet + shorts |
| 12 to 25 | Tee + shorts |
| 7 to 12 | Long sleeve + shorts |
| 2 to 7 | Long sleeve + tights |
| −5 to 2 | Long sleeve + light jacket + tights |
| −12 to −5 | Thermal base + light jacket + tights |
| < −12 | Thermal base + insulated jacket + windproof shell + winter tights |

## 3. Accessories (air temperature)

| Item | When | Source |
|---|---|---|
| Light gloves | T ≤ 5, until mittens | approved |
| Ear headband | T ≤ 0, until toque | approved |
| Mittens (replace gloves) | T ≤ −10 | approved |
| Toque (replaces headband) | T ≤ −10 | approved |
| Neck warmer | T ≤ −10 | approved |
| Thermal socks | T ≤ −10, **text suggestion only** ("if they still fit your shoes") | approved |
| Cap | never suggested (not for rain, not for sun) | approved |

Gloves/mittens and headband/toque are mutually exclusive by construction.
The old `gloves` item is retired (light gloves → mittens only). [assumed]

## 4. Modifiers

### Wind (windy = sustained ≥ 25 km/h)

| T | Effect | Source |
|---|---|---|
| ≥ 15 | Text only: "Windy, you'll warm up" | approved (Q4) |
| 2 to 15 | Outer layer must block wind → windbreaker | approved 2–12, **assumed 12–15** |
| −8 to 2 | Existing jacket must block wind: "Light jacket (windproof)" | approved |
| < −8 | Winter outfit (§2 row < −12) kicks in early | approved ("around −10") |
| −10 < T ≤ −5 | Neck warmer becomes optional | approved |

### Rain and wet precipitation

| T | Light | Steady | Heavy | Source |
|---|---|---|---|---|
| ≥ 15 | nothing (accept wet) | nothing | light rain shell | approved (Q6, calibration) |
| 2 to 15 | rain shell | rain shell | rain shell | approved |
| < 2 (rain, wet snow, freezing rain) | waterproof shell **over** the warm layers | same | same | approved (Q5, scenario 7) |

### One outer layer (the reconciliation rule)

Each rule raises requirements on one outer slot: `blocksWind`, `blocksRain`,
`warm`. The resolver picks the lightest garment that meets them all:

| Needs | Outer garment (art) |
|---|---|
| wind only, T ≥ 2 | Windbreaker (`windbreaker`) |
| rain (± wind), T ≥ 2 | Rain shell (`raincoat`), blocks wind too |
| warm (± wind), −12 ≤ T < 2 | Light jacket (`light-jacket`), labelled "(windproof)" when windy |
| warm + rain, T < 2 | Light jacket **under** a waterproof shell (`raincoat` drawn) [approved Q5: light jacket] |
| winter (< −12, or < −8 windy) | Insulated jacket under windproof shell (`windproof-shell` drawn) |
| winter + wet | Insulated jacket under waterproof shell (`raincoat` drawn) |

Never two shells. Never windbreaker + rain shell. [approved principle]

### Snow, ice and footwear (text only, never on the duck)

Forecast wording only, never claims about a specific route's surface. [approved]

| Forecast | Advice |
|---|---|
| Dry snow falling | "Snow expected. Paths may be slippery." |
| Snow depth ≥ 1 cm, or > 2 cm fell in the last 24 h | "Snow on the ground likely. Shoes with grip help on packed snow." |
| Wet in the last 24 h and run-hour T ≤ 0 after being above 0 | "Possible refreeze: watch for ice. Trail shoes don't grip ice; use ice traction or take a shorter route." |
| Freezing rain at run time | **Warning:** "Freezing rain: sidewalks may be glazed with ice." |

`grippy-shoes` is removed from the duck. [assumed, follows approved principle]

## 5. Supplemental advice

| Advice | When | Source |
|---|---|---|
| Bring a removable warm layer for the wait (10–20 min) | T ≤ 0, or 0 < T ≤ 5 and (wet or windy) | approved |
| Change into dry clothes right after | (T ≤ 5 and wet) or T ≤ 0 | approved |
| Frostbite: cover exposed skin | wind chill ≤ −27 | approved (Q8), threshold = EC's "high risk" band |
| Frostbite can happen in under 10 min | wind chill ≤ −40 | assumed (EC band) |
| Heat: water, easy pace, shade | humidex ≥ 30 | approved (Q7) |
| Heat: stronger ("take walk breaks, know signs of heat illness") | humidex ≥ 35 | approved (Q7) |
| Dark: reflective vest / headlamp | as today | kept from existing app |

The app never says "cancel". Severe conditions are stated neutrally;
organisers decide. [approved Q8]

## 6. Outfit object (one per run hour)

```ts
interface Outfit {
  base: 'singlet' | 'tee' | 'long-sleeve' | 'thermal';
  insulation?: 'light-jacket' | 'insulated-jacket';
  outer?: 'windbreaker' | 'raincoat' | 'windproof-shell';
  legs: 'shorts' | 'tights' | 'winter-tights';
  head?: 'headband' | 'toque';
  hands?: 'light-gloves' | 'mittens';
  neck?: 'neck-warmer';
  visibility: ('reflective-vest' | 'headlamp')[];
  optional: { item: ItemId; why: string }[];   // "Run cold?" lines, text only
  bring: Advice[];                              // waiting layer, dry clothes, thermal socks
  advisories: Advice[];                         // severity: info | caution | warning
  footwear?: Advice;
  effect: 'rain' | 'snow' | null;               // falling flourish
  facts: { tempC; feelsC; windKmh; gustKmh; rainMm; humidex?; windChill? };
}
```

- `wearList(outfit)`: the written list, in body order. Same function for site and story.
- `duckLayers(outfit)`: the drawn list. Shows legs, the **outermost** top
  (outer ?? insulation ?? base), head, hands, neck, visibility. Inner layers are
  text only, so no new art is needed (an insulated jacket is always under a shell).
- Invariant tests: everything drawn is in the written list; nothing optional is drawn.

## 7. Website

- Hero: duck, one-line headline, the written list, then "Run cold?" lines
  (muted), then Bring and Advisories.
- Remove the "Dress for X°: you warm up by…" line (no run-feel any more).
- Details keep: air temp, feels like, wind/gusts, precipitation, humidex in summer.
- Dev-only contact sheet `?duck-sheet` (like `?sim`): every scenario in §9
  rendered as duck + text, for visual review with other runners.

## 8. Sunday story (1080 × 1920 PNG)

**Event config**, hand-edited `src/data/event.json`:

```json
{
  "day": "sunday",
  "meetTime": "10:00",
  "startTime": "10:15",
  "place": {
    "name": "Café Tranquille entrance",
    "description": "Esplanade Tranquille, 1442 Rue Clark (Quartier des spectacles)",
    "lat": 45.50935,
    "lon": -73.56488
  }
}
```

Coordinates: OpenStreetMap's Café Tranquille node (1442 Rue Clark), confirmed
correct by Shereen. [approved]

The story's forecast hour is the hour containing the start (10:00 for a
10:15 start), which also covers the 15 min wait. [assumed]

**Flow:** Dashboard → MAKE STORY (enabled once the forecast covers next
Sunday's start) → preview → SAVE / SHARE.

**Snapshot:** on MAKE STORY, freeze `{ fetchedAt, runAt, hour facts, outfit, event }`.
Render once to a PNG blob; the preview shows that blob and SAVE/SHARE sends the
same blob. A forecast refresh afterwards does not change it; REMAKE does.

**Layout (top to bottom):** SEE YOU SUNDAY! · date, meet time, start time ·
duck (large) with temperature and conditions · what to wear (≤ 6 lines) ·
one advisory if any (most severe) · meeting-point map with pin and description ·
"New here? You're welcome! Run/walk friendly · Nobody left behind." ·
Les Stooopids / AnyoneCanPace wordmark in the app's own style (JetBrains Mono,
brand colours from CLAUDE.md, Comic Neue only for the duck's bubble; no
separate logo) [approved] · small "Forecast from Sat 9:12 p.m.,
Open-Meteo / ECCC GEM · map © OpenStreetMap contributors".
Keep text ≥ 40 px and inside Instagram's safe area (top 250 px and bottom
250 px free of key content).

**Rendering:** Canvas 2D, no new dependencies.
- Fonts: `await document.fonts.load()` for JetBrains Mono (and Comic Neue for
  the duck's bubble) before drawing.
- Duck: draw `duck-base` then `duckLayers(outfit)` (same function as the site),
  each `await img.decode()`. All same-origin, so the canvas is never tainted.
- Map: a **pre-rendered, committed** image of the meeting point (pin included),
  made from the app's own offline map by a dev-only tool. More reliable on
  iPhone than rendering WebGL into a canvas at export time. Remake it when the
  place changes.
- Export: `canvas.toBlob('image/png')` → `navigator.share({ files })` when
  `navigator.canShare` allows it (iOS Safari and the installed PWA) → else a
  download link → else show the image full screen with "press and hold to save".
- COPY MAP LINK button: `https://www.google.com/maps/search/?api=1&query=45.50935,-73.56488`
  for Instagram's Link sticker.

## 9. Tests and acceptance

Unit (pure):
- Each band, each cutoff exactly, ±0.1 °C around it, and each optional zone.
- Accessories: gloves vs mittens, headband vs toque at −10/−9.9; thermal socks text only.
- Wind at 24.9 / 25 km/h; gusts alone do nothing.
- Rain light/steady/heavy at 14.9 / 15; probability-only → note, no gear.
- Overlap: 10 °C + rain + wind → one rain shell; 0 °C + rain → jacket under shell.
- Wet vs dry snow at −2 / −2.1; freezing rain → warning.
- Waiting layer at 0, 0.1 (calm/dry vs windy/wet), 5, 5.1.
- Wind chill and humidex against Environment Canada reference values.
- Missing fields; Montréal time zone across the DST change.
- Invariants: drawn ⊆ written; optional never drawn; ≤ 1 outer; every drawn id has art.

Scenario table (Rounds 1 and 2 as approved):

| # | Weather | Expected |
|---|---|---|
| 1 | 15, dry, calm | tee + shorts |
| 2 | 10, dry, 30 km/h | long sleeve + shorts + windbreaker |
| 3 | 5, steady rain | long sleeve + tights + rain shell + light gloves |
| 4 | 0, dry, 30 km/h | long sleeve + light jacket (windproof) + tights + light gloves + headband; waiting layer |
| 5 | −5, light dry snow | long sleeve + light jacket + tights + gloves + headband; thermal optional; snow note |
| 6 | −10, dry, 30 km/h | thermal + insulated + windproof shell + winter tights + mittens + toque + neck warmer; socks; waiting layer |
| 7 | 0, wet snow, windy | long sleeve + light jacket under waterproof shell + tights + gloves + headband; waiting; dry clothes |
| 8 | −20, dry, 15 km/h | winter outfit + mittens + toque + neck; socks; waiting; frostbite if WC ≤ −27 |
| 9 | 7, dry, calm | long sleeve + shorts; "Run cold? tights" |
| 10 | 2, dry, calm | long sleeve + tights + light gloves; "Run cold? light jacket" |
| 11 | −3, dry, calm | long sleeve + light jacket + tights + gloves + headband; "Run cold? thermal" |
| 12 | 15, dry, 35 km/h | tee + shorts; wind note only |
| 13 | −3, wet snow, 30 km/h | long sleeve + light jacket under waterproof shell + tights + gloves + headband; thermal optional |
| 14 | 12, steady rain | tee + shorts + rain shell |
| 15 | 25, humid | singlet + shorts; heat advice (strong if humidex ≥ 35) |
| 16 | −15, dry, 40 km/h | winter outfit + mittens + toque + neck warmer; frostbite warning (neutral) |

#5: −5 °C is too warm to require a thermal (confirmed); it stays optional
there. #13: "warm jacket" means the light running jacket (confirmed).

Story: dimensions 1080 × 1920; preview blob === shared blob; text within safe
area at 375 px preview; pin visible; date/time correct across DST; works in iOS
Safari and the installed PWA (manual check on a phone).

Real-world: 30–50 Montréal scenarios over four seasons through `?duck-sheet`,
reviewed with runners who run cold and warm.

## 10. Staged plan

1. **Rules engine** (`src/weather/outfit.ts` rewrite behind the new `Outfit`;
   forecast fields; wind chill / humidex). Tests first from §9. Dashboard text
   updated; duck still uses existing art.
2. **Duck composer + contact sheet**: `duckLayers(outfit)`, invariants,
   `?duck-sheet`, visual review. Retire `gloves` and `grippy-shoes` from rules.
3. **Event config + meeting map image** (+ COPY MAP LINK).
4. **Story export**: snapshot, canvas layout, share/download fallbacks, iPhone check.
5. **Scenario review** with other runners; tune tables only.

No change to the timer, route navigation or service-worker behaviour.
