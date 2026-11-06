/**
 * What to wear for an easy 45–60 min community run: a pure function of the
 * weather at the run hour. Rules and their sources: design/weather-v1-spec.md.
 *
 * - Clothing reads the **air** temperature only. Wind, rain and snow are
 *   separate modifiers, so nothing is counted twice (feels-like, wind chill
 *   and humidex are for warnings and display).
 * - Each garment slot holds one thing. Wind, rain and cold raise needs on the
 *   one outer layer; it is never a windbreaker *and* a rain shell.
 * - The duck wears the running outfit. Optional "Run cold?" items, things to
 *   bring and footwear are text only.
 *
 * Numbers are one runner's calibration, kept in the tables below to tune.
 */
import { humidex as humidexOf, windChill as windChillOf } from './indices';

/** How long a run lasts, for "does it get dark during the run". */
export const RUN_DURATION_MIN = 60;

/**
 * Drawn duck pieces (one file each in src/assets/duck-outfit/). `singlet` is
 * on the base duck. `gloves`, `cap` and `grippy-shoes` still have art but no
 * rule uses them any more.
 */
export type ItemId =
  | 'singlet'
  | 'tee'
  | 'long-sleeve'
  | 'light-jacket'
  | 'thermal-layers'
  | 'windproof-shell'
  | 'shorts'
  | 'tights'
  | 'cap'
  | 'light-gloves'
  | 'gloves'
  | 'mittens'
  | 'headband'
  | 'toque'
  | 'neck-warmer'
  | 'raincoat'
  | 'windbreaker'
  | 'grippy-shoes'
  | 'reflective-vest'
  | 'headlamp';

/** What someone wears, by slot. */
export type Base = 'singlet' | 'tee' | 'long-sleeve' | 'thermal';
export type Warm = 'light-jacket' | 'insulated-jacket';
export type Outer = 'windbreaker' | 'rain-shell' | 'windproof-shell';
export type Legs = 'shorts' | 'tights' | 'winter-tights';
export type Head = 'headband' | 'toque';
export type Hands = 'light-gloves' | 'mittens';
export type Visibility = 'reflective-vest' | 'headlamp';
export type GarmentId = Base | Warm | Outer | Legs | Head | Hands | 'neck-warmer' | Visibility | 'thermal-socks';

/** Air-temperature cutoffs (°C). Below a cutoff the item is worn; from the cutoff to 2 °C above it (inclusive), it's a "Run cold?" option. */
export const CUTOFFS = {
  /** Long sleeve instead of a tee. */
  longSleeve: 12,
  /** Tights instead of shorts. */
  tights: 7,
  /** Light jacket over the long sleeve. */
  jacket: 2,
  /** Thermal top instead of the long sleeve. */
  thermal: -5,
  /** Insulated jacket + windproof shell + winter tights. */
  winter: -12,
} as const;

/** Width of the "Run cold?" zone above each cutoff (°C). */
export const OPTIONAL_BAND_C = 2;

/** At or below (°C). */
export const ACCESSORIES = {
  lightGloves: 5,
  headband: 0,
  /** Mittens, toque, neck warmer and the thermal-socks suggestion replace/join at this point. */
  deepCold: -10,
} as const;

export const HEAT = {
  /** Singlet from this air temperature… */
  singletC: 25,
  /** …or this humidex, which is also when heat advice starts. */
  adviceHumidex: 30,
  strongHumidex: 35,
} as const;

export const WIND = {
  /** Sustained wind (km/h) that counts as windy. Gusts alone don't. */
  windyKmh: 25,
  /** At or above this air temperature, wind gets a note, not a garment. */
  noteOnlyFromC: 15,
  /** Below this, the jacket must be windproof (down to `winterBelowC`). */
  windproofJacketBelowC: 2,
  /** Windy and below this → the winter outfit early. */
  winterBelowC: -8,
  /** Windy between deepCold and this: neck warmer offered. */
  neckOfferAtC: -5,
} as const;

export const WET = {
  /** Rain (+ showers) in the hour that counts as wet (mm). */
  rainMm: 0.3,
  steadyMm: 1,
  heavyMm: 4,
  /** Light and steady rain need no shell from here up; heavy rain gets a light one. */
  noShellFromC: 15,
  /** Below this, wet weather needs a waterproof shell over the warm layers. */
  waterproofBelowC: 2,
  /** Snow at or above this is wet snow. */
  wetSnowFromC: -2,
  /** A chance of precipitation this high, with nothing measurable, gets a note. */
  chanceNotePct: 40,
} as const;

export const GROUND = {
  /** Snow on the ground (m). */
  snowDepthM: 0.01,
  /** Snow in the last 24 h (cm). */
  recentSnowCm: 2,
  /** Rain near this or below can freeze on the ground. */
  iceC: 1,
} as const;

export const FROSTBITE = { highRiskC: -27, severeC: -40 } as const;

/** When to bring the waiting layer and change into dry clothes. */
export const WAITING = { alwaysAtC: 0, wetOrWindyAtC: 5 } as const;

const RAIN_CODES = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
const STEADY_CODES = [63, 81];
const HEAVY_CODES = [65, 82, 95, 96, 99];
const FREEZING_CODES = [56, 57, 66, 67];
const SNOW_CODES = [71, 73, 75, 77, 85, 86];

export type Light = 'day' | 'dusk' | 'dark';

/** The last 24 h before the run, for snow on the ground and refreeze. */
export interface Recent {
  /** Rain + showers (mm). */
  wetMm: number;
  snowCm: number;
  /** Was the air above 0 °C at some point? */
  wasAboveZero: boolean;
}

export interface OutfitInput {
  /** Air temperature (°C). Drives every clothing rule. */
  tempC: number;
  /** Feels-like (°C), for display only. */
  feelsC: number;
  dewPointC: number | null;
  precipProb: number | null;
  /** Rain + showers in the hour (mm). Null = unknown. */
  rainMm: number | null;
  snowCm: number | null;
  /** All precipitation in the hour (mm), for wet-snow intensity. */
  precipMm: number | null;
  snowDepthM: number | null;
  code: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  /** Daylight at the run: dark at the start, or getting dark during it (dusk). */
  light: Light;
  /** Null when the forecast doesn't reach back far enough. */
  recent: Recent | null;
}

export interface WearItem {
  id: GarmentId;
  label: string;
}

export interface OptionalItem {
  id: GarmentId;
  /** Full sentence, e.g. "Run cold? Wear tights instead of shorts." */
  text: string;
}

export interface Advice {
  level: 'info' | 'caution' | 'warning';
  text: string;
}

export type Condition = 'rain' | 'wet-snow' | 'snow' | 'freezing-rain' | 'wind' | 'heat' | 'frostbite' | 'dark';

export interface Outfit {
  base: Base;
  warm: Warm | null;
  outer: Outer | null;
  legs: Legs;
  head: Head | null;
  hands: Hands | null;
  neck: 'neck-warmer' | null;
  visibility: Visibility[];
  /** What to wear, in reading order. The duck draws a subset of this (`drawn`). */
  wear: WearItem[];
  /** "Run cold?" options and suggestions. Text only. */
  optional: OptionalItem[];
  /** Things to bring for before and after the run. */
  bring: string[];
  /** Weather and ground warnings, most serious first. */
  advisories: Advice[];
  conditions: Condition[];
  /** One line, ends with a full stop. */
  headline: string;
  /** Duck pieces for this outfit (outermost top, legs, extremities, visibility). */
  drawn: ItemId[];
  /** Falling weather on the duck. */
  effect: 'rain' | 'snow' | null;
  windChillC: number | null;
  humidex: number | null;
}

const LABEL: Record<GarmentId, string> = {
  singlet: 'Singlet',
  tee: 'Tee',
  'long-sleeve': 'Long sleeve',
  thermal: 'Thermal top',
  'light-jacket': 'Light jacket',
  'insulated-jacket': 'Insulated jacket',
  windbreaker: 'Windbreaker',
  'rain-shell': 'Rain shell',
  'windproof-shell': 'Windproof shell',
  shorts: 'Shorts',
  tights: 'Tights',
  'winter-tights': 'Winter tights',
  'light-gloves': 'Light gloves',
  mittens: 'Mittens',
  headband: 'Ear headband',
  toque: 'Toque',
  'neck-warmer': 'Neck warmer',
  'reflective-vest': 'Reflective vest',
  headlamp: 'Headlamp',
  'thermal-socks': 'Thermal socks',
};

/** The written label for a garment (same words on the dashboard and the story). */
export const garmentLabel = (id: GarmentId) => LABEL[id];

/** In the "Run cold?" zone just above a cutoff. */
const nearAbove = (t: number, cutoff: number) => t >= cutoff && t <= cutoff + OPTIONAL_BAND_C;

export function whatToWear(w: OutfitInput): Outfit {
  const t = w.tempC;
  const code = w.code;
  const has = (codes: number[]) => code !== null && codes.includes(code);

  // ── Weather facts ───────────────────────────────────────────────────────
  const windy = w.windKmh !== null && w.windKmh >= WIND.windyKmh;
  const freezingRain = has(FREEZING_CODES);
  const snowing = (w.snowCm ?? 0) > 0 || has(SNOW_CODES);
  const raining = has(RAIN_CODES) || (w.rainMm ?? 0) >= WET.rainMm;
  const wetSnow = snowing && (t >= WET.wetSnowFromC || raining);
  const drySnow = snowing && !wetSnow;
  const wet = raining || wetSnow || freezingRain;
  const amount = wetSnow ? (w.precipMm ?? w.rainMm ?? 0) : (w.rainMm ?? 0);
  const intensity: 'light' | 'steady' | 'heavy' =
    has(HEAVY_CODES) || amount >= WET.heavyMm ? 'heavy' : has(STEADY_CODES) || amount >= WET.steadyMm ? 'steady' : 'light';
  const hx = w.dewPointC !== null ? humidexOf(t, w.dewPointC) : null;
  const wc = w.windKmh !== null ? windChillOf(t, w.windKmh) : null;

  // ── Base outfit (air temperature) ───────────────────────────────────────
  const winter = t < CUTOFFS.winter || (windy && t < WIND.winterBelowC);
  const base: Base =
    winter || t < CUTOFFS.thermal
      ? 'thermal'
      : t < CUTOFFS.longSleeve
        ? 'long-sleeve'
        : t >= HEAT.singletC || (hx !== null && hx >= HEAT.adviceHumidex)
          ? 'singlet'
          : 'tee';
  const legs: Legs = winter ? 'winter-tights' : t < CUTOFFS.tights ? 'tights' : 'shorts';
  const warm: Warm | null = winter ? 'insulated-jacket' : t < CUTOFFS.jacket ? 'light-jacket' : null;

  // ── The one outer layer ─────────────────────────────────────────────────
  let outer: Outer | null = winter ? 'windproof-shell' : null;
  let shellLabel = LABEL['rain-shell'];
  if (wet) {
    if (t < WET.waterproofBelowC) {
      outer = 'rain-shell'; // over the warm layers, also blocks wind
      shellLabel = 'Waterproof shell';
    } else if (t < WET.noShellFromC) {
      outer = 'rain-shell';
    } else if (intensity === 'heavy') {
      outer = 'rain-shell';
      shellLabel = 'Light rain shell';
    }
  }
  if (windy && !outer && !warm && t < WIND.noteOnlyFromC) outer = 'windbreaker';
  const windproofJacket = windy && warm === 'light-jacket' && !outer;

  // ── Accessories (air temperature) ───────────────────────────────────────
  const deep = t <= ACCESSORIES.deepCold;
  const hands: Hands | null = deep ? 'mittens' : t <= ACCESSORIES.lightGloves ? 'light-gloves' : null;
  const head: Head | null = deep ? 'toque' : t <= ACCESSORIES.headband ? 'headband' : null;
  const neck = deep ? ('neck-warmer' as const) : null;
  const visibility: Visibility[] =
    w.light === 'dark' ? ['reflective-vest', 'headlamp'] : w.light === 'dusk' ? ['reflective-vest'] : [];

  // ── Written list ────────────────────────────────────────────────────────
  const wear: WearItem[] = [];
  const put = (id: GarmentId, label = LABEL[id]) => wear.push({ id, label });
  put(base);
  if (warm) put(warm, windproofJacket ? 'Windproof light jacket' : LABEL[warm]);
  if (outer) put(outer, outer === 'rain-shell' ? shellLabel : LABEL[outer]);
  put(legs);
  if (hands) put(hands);
  if (head) put(head);
  if (neck) put(neck);
  visibility.forEach((v) => put(v));

  // ── "Run cold?" options ─────────────────────────────────────────────────
  const optional: OptionalItem[] = [];
  if (base === 'tee' && nearAbove(t, CUTOFFS.longSleeve))
    optional.push({ id: 'long-sleeve', text: 'Run cold? Wear a long sleeve instead of the tee.' });
  if (legs === 'shorts' && nearAbove(t, CUTOFFS.tights))
    optional.push({ id: 'tights', text: 'Run cold? Wear tights instead of shorts.' });
  if (!warm && nearAbove(t, CUTOFFS.jacket))
    optional.push({ id: 'light-jacket', text: 'Run cold? Add a light jacket.' });
  if (base === 'long-sleeve' && nearAbove(t, CUTOFFS.thermal))
    optional.push({ id: 'thermal', text: 'Run cold? Wear a thermal top instead of the long sleeve.' });
  if (!winter && nearAbove(t, CUTOFFS.winter))
    optional.push({
      id: 'insulated-jacket',
      text: 'Run cold? Go full winter: insulated jacket, windproof shell and winter tights.',
    });
  if (windy && !neck && t <= WIND.neckOfferAtC)
    optional.push({ id: 'neck-warmer', text: 'Windy and cold: a neck warmer protects your neck and face.' });
  if (deep) optional.push({ id: 'thermal-socks', text: 'Thermal socks help, if they still fit in your shoes.' });

  // ── Bring ───────────────────────────────────────────────────────────────
  const bring: string[] = [];
  const chilly = t <= WAITING.alwaysAtC || (t <= WAITING.wetOrWindyAtC && (wet || windy));
  if (chilly) bring.push('A warm layer for the 10–20 min wait at the start. Take it off to run.');
  if (t <= WAITING.alwaysAtC || (t <= WAITING.wetOrWindyAtC && wet))
    bring.push('Dry clothes to change into right after the run.');

  // ── Advisories ──────────────────────────────────────────────────────────
  const advisories: Advice[] = [];
  const conditions: Condition[] = [];
  const deg = (c: number) => `${Math.round(c) === 0 ? 0 : Math.round(c)}°`;

  if (wc !== null && wc <= FROSTBITE.highRiskC) {
    conditions.push('frostbite');
    advisories.push({
      level: 'warning',
      text:
        wc <= FROSTBITE.severeC
          ? `Wind chill ${deg(wc)}: frostbite on exposed skin can happen in under 10 minutes. Cover your face, ears and hands.`
          : `Wind chill ${deg(wc)}: high frostbite risk on exposed skin. Cover your face, ears and hands.`,
    });
  }
  if (freezingRain) {
    conditions.push('freezing-rain');
    advisories.push({ level: 'warning', text: 'Freezing rain forecast: sidewalks may be glazed with ice.' });
  }
  if (hx !== null && hx >= HEAT.adviceHumidex) {
    conditions.push('heat');
    advisories.push(
      hx >= HEAT.strongHumidex
        ? {
            level: 'warning',
            text: `Humidex ${Math.round(hx)}: take walk breaks, drink water, and stop if you feel dizzy or sick.`,
          }
        : { level: 'caution', text: `Humidex ${Math.round(hx)}: bring water, go easy and look for shade.` },
    );
  }

  const groundSnow =
    (w.snowDepthM ?? 0) >= GROUND.snowDepthM || (w.recent !== null && w.recent.snowCm > GROUND.recentSnowCm);
  const refreeze =
    t <= 0 && w.recent !== null && w.recent.wasAboveZero && (w.recent.wetMm >= WET.rainMm || w.recent.snowCm > 0);
  const iceNow = raining && !snowing && !freezingRain && t <= GROUND.iceC;
  if (refreeze || iceNow)
    advisories.push({
      level: 'caution',
      text: refreeze
        ? "Possible refreeze: watch for ice. Trail shoes don't grip ice; use ice traction or pick a shorter route."
        : 'Rain near freezing: watch for ice.',
    });
  if (groundSnow)
    advisories.push({ level: 'caution', text: 'Snow on the ground likely. Shoes with grip help on packed snow.' });

  if (wetSnow) {
    conditions.push('wet-snow');
    advisories.push({ level: 'info', text: 'Wet snow expected: slush and slippery paths.' });
  } else if (drySnow) {
    conditions.push('snow');
    advisories.push({ level: 'info', text: 'Snow expected. Paths may be slippery.' });
  } else if (raining) {
    conditions.push('rain');
    const chance = w.precipProb !== null ? ` (${Math.round(w.precipProb)} % chance)` : '';
    advisories.push({
      level: 'info',
      text:
        outer === 'rain-shell'
          ? `${capitalise(intensity)} rain expected${chance}.`
          : `${capitalise(intensity)} rain expected${chance}. Warm enough to just get wet.`,
    });
  } else if (!freezingRain && w.precipProb !== null && w.precipProb >= WET.chanceNotePct) {
    advisories.push({ level: 'info', text: `${Math.round(w.precipProb)} % chance of rain or snow.` });
  }

  if (windy) {
    conditions.push('wind');
    const gusts = w.gustKmh !== null ? `, gusts ${Math.round(w.gustKmh)} km/h` : '';
    const what = `Windy (${Math.round(w.windKmh!)} km/h${gusts})`;
    advisories.push({
      level: 'info',
      text:
        t >= WIND.noteOnlyFromC
          ? `${what}: you'll warm up once you're moving.`
          : outer || warm
            ? `${what}: zip your jacket up.`
            : `${what}.`,
    });
  }

  if (w.light !== 'day') {
    conditions.push('dark');
    advisories.push({
      level: 'info',
      text: w.light === 'dark' ? 'Dark at run time: be seen.' : 'It gets dark during the run: be seen.',
    });
  }

  const unknown = [w.windKmh === null && 'wind', w.rainMm === null && w.snowCm === null && 'rain or snow'].filter(
    Boolean,
  );
  if (unknown.length)
    advisories.push({ level: 'info', text: `${capitalise(unknown.join(' and '))} unknown in this forecast: check outside.` });

  const order = { warning: 0, caution: 1, info: 2 } as const;
  advisories.sort((a, b) => order[a.level] - order[b.level]);

  // ── Headline and duck ───────────────────────────────────────────────────
  const main = wear.filter((i) => [base, warm, outer, legs].includes(i.id as never)).map((i) => i.label.toLowerCase());
  const word: Record<Condition, string> = {
    frostbite: 'frostbite risk',
    'freezing-rain': 'freezing rain',
    heat: 'hot and humid',
    'wet-snow': 'wet snow',
    snow: 'snow',
    rain: 'rain',
    wind: 'windy',
    dark: 'dark',
  };
  const tail = conditions.map((c) => word[c]);
  const headline =
    `${capitalise(main.join(', '))}.` + (tail.length ? ` ${capitalise(tail.join(', '))}.` : '');

  const top: ItemId | null =
    outer === 'rain-shell'
      ? 'raincoat'
      : outer
        ? outer
        : warm === 'light-jacket'
          ? 'light-jacket'
          : base === 'tee' || base === 'long-sleeve'
            ? base
            : null; // singlet is on the base duck; a thermal or insulated jacket is never outermost
  const drawn: ItemId[] = [
    legs === 'winter-tights' ? 'thermal-layers' : legs,
    ...(top ? [top] : []),
    ...(hands ? [hands] : []),
    ...(head ? [head] : []),
    ...(neck ? [neck] : []),
    ...visibility,
  ];

  return {
    base,
    warm,
    outer,
    legs,
    head,
    hands,
    neck,
    visibility,
    wear,
    optional,
    bring,
    advisories,
    conditions,
    headline,
    drawn,
    effect: snowing ? 'snow' : wet ? 'rain' : null,
    windChillC: wc !== null && wc < t ? wc : null,
    humidex: hx,
  };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
