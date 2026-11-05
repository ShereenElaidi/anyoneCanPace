/**
 * What to wear for a run: a pure function of the weather at the run hour.
 *
 * Principle: dress for the "run feel", not the weather. Run feel is the
 * feels-like temperature plus an offset, because moving warms you up.
 * Every number here is a starting point meant to be tuned: the tiers and
 * the modifier thresholds each live in one table.
 */

/** Added to the feels-like temperature. Pacers run/walk intervals and stand around, so it's lower than racing advice (+10). */
export const RUN_FEEL_OFFSET_C = 7;

/** How long a run lasts, for "does it get dark during the run". */
export const RUN_DURATION_MIN = 60;

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
  | 'sunglasses'
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

/** Default wording for each item. Ids stay stable for the dressed duck (Stage 3). */
export const ITEM_LABEL: Record<ItemId, string> = {
  singlet: 'Singlet',
  tee: 'Tee',
  'long-sleeve': 'Long sleeve',
  'light-jacket': 'Light jacket',
  'thermal-layers': 'Thermal top and tights',
  'windproof-shell': 'Windproof shell',
  shorts: 'Shorts',
  tights: 'Tights',
  cap: 'Cap',
  sunglasses: 'Sunglasses',
  'light-gloves': 'Light gloves',
  gloves: 'Gloves',
  mittens: 'Mittens',
  headband: 'Headband (ears)',
  toque: 'Toque',
  'neck-warmer': 'Neck warmer',
  raincoat: 'Raincoat',
  windbreaker: 'Windbreaker',
  'grippy-shoes': 'Shoes with grip (trail shoes or ice cleats)',
  'reflective-vest': 'Reflective vest',
  headlamp: 'Headlamp',
};

export interface Tier {
  id: 'hot' | 'warm' | 'mild' | 'cool' | 'cold' | 'very-cold';
  /** Applies when run feel ≥ this (°C). Checked top to bottom. */
  minC: number;
  headline: string;
  items: (ItemId | { id: ItemId; label: string })[];
}

/** Starting-point tiers on run feel. Edit here to tune. */
export const TIERS: Tier[] = [
  { id: 'hot', minC: 25, headline: 'Hot: dress as light as you can', items: ['singlet', 'shorts', 'cap', 'sunglasses'] },
  { id: 'warm', minC: 18, headline: 'Warm: tee and shorts', items: ['tee', 'shorts', 'cap'] },
  {
    id: 'mild',
    minC: 10,
    headline: 'Mild: tee or light long sleeve, shorts',
    items: [{ id: 'tee', label: 'Tee or light long sleeve' }, 'shorts'],
  },
  { id: 'cool', minC: 3, headline: 'Cool: long sleeve and tights', items: ['long-sleeve', 'tights', 'light-gloves'] },
  {
    id: 'cold',
    minC: -4,
    headline: 'Cold: long sleeve, light jacket, tights',
    items: ['long-sleeve', 'light-jacket', 'tights', 'gloves', 'headband'],
  },
  {
    id: 'very-cold',
    minC: -Infinity,
    headline: 'Very cold: full winter layers',
    items: ['thermal-layers', 'windproof-shell', 'toque', 'mittens', 'neck-warmer'],
  },
];

/** Modifier thresholds. Edit here to tune. */
export const MODIFIERS = {
  /** Rain gear at this chance of precipitation (%)… */
  rainChancePct: 50,
  /** …or this much rain in the hour (mm). */
  rainMm: 0.3,
  /** Windbreaker at this sustained wind (km/h)… */
  windKmh: 25,
  /** …or these gusts (km/h). */
  gustKmh: 40,
  /** Estimated UV index for sunglasses + sunscreen. */
  uvHigh: 6,
  /** Estimated UV index for a sunscreen note. */
  uvModerate: 3,
  /** At or below this air temperature, wet ground may freeze. */
  icyTempC: 1,
  /** Snow on the ground (m) counts as slippery. */
  snowDepthM: 0.01,
};

const RAIN_CODES = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
const FREEZING_CODES = [56, 57, 66, 67];
const SNOW_CODES = [71, 73, 75, 77, 85, 86];

export type Light = 'day' | 'dusk' | 'dark';

export interface OutfitInput {
  tempC: number;
  feelsC: number;
  precipProb: number | null;
  rainMm: number;
  snowCm: number;
  snowDepthM: number;
  code: number;
  windKmh: number;
  gustKmh: number;
  /** Estimated UV index at the run hour. */
  uvIndex: number;
  /** Daylight at the run: dark at the start, or getting dark during it (dusk). */
  light: Light;
}

export interface OutfitItem {
  id: ItemId;
  label: string;
  /** Why it's worn, when that isn't obvious ("the brim keeps rain out of your eyes"). Kept out of the label so chips stay short. */
  why?: string;
}

export interface Outfit {
  runFeelC: number;
  tier: Tier['id'];
  headline: string;
  items: OutfitItem[];
  notes: string[];
  /** Short condition flags, also used for the headline. */
  conditions: ('rain' | 'snow' | 'slippery' | 'wind' | 'sun' | 'dark')[];
}

export function tierFor(runFeelC: number): Tier {
  return TIERS.find((t) => runFeelC >= t.minC) ?? TIERS[TIERS.length - 1];
}

export function whatToWear(w: OutfitInput): Outfit {
  const runFeelC = w.feelsC + RUN_FEEL_OFFSET_C;
  const tier = tierFor(runFeelC);
  const items: OutfitItem[] = tier.items.map((it) =>
    typeof it === 'string' ? { id: it, label: ITEM_LABEL[it] } : { ...it },
  );
  const notes: string[] = [];
  const conditions: Outfit['conditions'] = [];
  const has = (id: ItemId) => items.some((i) => i.id === id);
  const add = (id: ItemId, label = ITEM_LABEL[id]) => {
    if (!has(id)) items.push({ id, label });
  };
  const replace = (from: ItemId, to: OutfitItem) => {
    const i = items.findIndex((x) => x.id === from);
    if (i === -1) return false;
    items[i] = to;
    return true;
  };

  const snowing = w.snowCm > 0 || SNOW_CODES.includes(w.code);
  const freezing = FREEZING_CODES.includes(w.code);
  const likelyWet = (w.precipProb ?? 0) >= MODIFIERS.rainChancePct;
  const rain =
    freezing || RAIN_CODES.includes(w.code) || w.rainMm >= MODIFIERS.rainMm || (likelyWet && !snowing && w.tempC > 0);
  const slippery =
    snowing ||
    freezing ||
    w.snowDepthM >= MODIFIERS.snowDepthM ||
    (w.tempC <= MODIFIERS.icyTempC && (rain || likelyWet));
  const windy = w.windKmh >= MODIFIERS.windKmh || w.gustKmh >= MODIFIERS.gustKmh;

  if (rain) {
    conditions.push('rain');
    // A waterproof shell also blocks wind, so it takes the jacket's place.
    if (
      !replace('light-jacket', { id: 'raincoat', label: ITEM_LABEL.raincoat, why: 'instead of the light jacket' }) &&
      !replace('windproof-shell', { id: 'raincoat', label: 'Waterproof shell' })
    ) {
      add('raincoat');
    }
    if (!has('toque')) {
      add('cap');
      items.find((i) => i.id === 'cap')!.why = 'the brim keeps rain out of your eyes';
    }
    notes.push(
      w.precipProb !== null ? `Rain likely (${Math.round(w.precipProb)} % chance).` : 'Rain likely.',
    );
  }

  if (snowing) {
    conditions.push('snow');
    notes.push('Snow at run time.');
  }

  if (slippery) {
    conditions.push('slippery');
    add('grippy-shoes');
    notes.push('Slippery: take shorter steps and watch for ice and slush.');
  }

  if (windy) {
    conditions.push('wind');
    const wind = `Windy (${Math.round(w.windKmh)} km/h, gusts ${Math.round(w.gustKmh)} km/h)`;
    if (has('raincoat') || has('windproof-shell') || has('light-jacket')) notes.push(`${wind}: zip your jacket up.`);
    else {
      add('windbreaker');
      notes.push(`${wind}: a windbreaker helps.`);
    }
  }

  const uv = Math.round(w.uvIndex);
  if (w.uvIndex >= MODIFIERS.uvHigh) {
    conditions.push('sun');
    add('sunglasses');
    notes.push(`Strong sun (estimated UV ${uv}): sunscreen and sunglasses.`);
  } else if (w.uvIndex >= MODIFIERS.uvModerate) {
    notes.push(`Some sun (estimated UV ${uv}): sunscreen on your face and neck.`);
  }

  if (w.light !== 'day') {
    conditions.push('dark');
    add('reflective-vest');
    if (w.light === 'dark') {
      add('headlamp');
      notes.push('Dark at run time: be seen.');
    } else {
      notes.push('It gets dark during the run: be seen.');
    }
  }

  notes.push('Bring an extra layer for the wait at the start.');

  const extra: Record<Outfit['conditions'][number], string> = {
    rain: 'rain likely',
    snow: 'snow',
    slippery: 'slippery',
    wind: 'windy',
    sun: 'strong sun',
    dark: 'dark',
  };
  const tail = conditions.filter((c) => !(c === 'snow' && conditions.includes('slippery'))).map((c) => extra[c]);
  const headline = tail.length ? `${tier.headline}. ${capitalise(tail.join(', '))}.` : `${tier.headline}.`;

  return { runFeelC, tier: tier.id, headline, items, notes, conditions };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
