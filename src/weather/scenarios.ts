/**
 * Montréal weather scenarios for reviewing the outfit rules: the 16 approved
 * in design/weather-v1-spec.md §9 (with their expected outfit) and realistic
 * cases across the seasons. Used by the tests and the dev-only `?duck-sheet`
 * page; nothing in the app imports it, so it never ships.
 */
import { humidex, windChill } from './indices';
import type { GarmentId, Light, OutfitInput, Recent } from './outfit';

export type Season = 'winter' | 'spring' | 'summer' | 'fall';

export interface Scenario {
  id: string;
  season: Season;
  name: string;
  input: OutfitInput;
  /** Approved outfit (spec §9), in list order. Absent = not reviewed yet. */
  expected?: GarmentId[];
}

/** Precipitation presets: the hour's amounts and weather code. */
export const PRECIP = {
  none: {},
  chance: { precipProb: 60 },
  drizzle: { code: 53, rainMm: 0.3, precipMm: 0.3, precipProb: 70 },
  'light rain': { code: 61, rainMm: 0.5, precipMm: 0.5, precipProb: 70 },
  'steady rain': { code: 63, rainMm: 2, precipMm: 2, precipProb: 90 },
  'heavy rain': { code: 65, rainMm: 6, precipMm: 6, precipProb: 100 },
  thunderstorm: { code: 95, rainMm: 8, precipMm: 8, precipProb: 90 },
  'dry snow': { code: 71, snowCm: 0.4, precipMm: 0.3, precipProb: 80 },
  'heavy snow': { code: 75, snowCm: 3, precipMm: 2.5, precipProb: 100 },
  'wet snow': { code: 73, snowCm: 1, rainMm: 0.4, precipMm: 1.5, precipProb: 90 },
  'freezing rain': { code: 66, rainMm: 1, precipMm: 1, precipProb: 90 },
} satisfies Record<string, Partial<OutfitInput>>;
export type PrecipKind = keyof typeof PRECIP;

export interface WxOptions {
  wind?: number;
  gust?: number;
  precip?: PrecipKind;
  dewPoint?: number;
  light?: Light;
  snowDepthM?: number;
  recent?: Recent;
  over?: Partial<OutfitInput>;
}

/** An hour of weather at an air temperature. Feels-like is derived the way the forecast would show it. */
export function wx(tempC: number, o: WxOptions = {}): OutfitInput {
  const wind = o.wind ?? 8;
  const dew = o.dewPoint ?? null;
  const feelsC = tempC <= 10 ? windChill(tempC, wind) : dew !== null ? Math.max(tempC, humidex(tempC, dew)) : tempC;
  return {
    tempC,
    feelsC: Math.round(feelsC),
    dewPointC: dew,
    precipProb: 0,
    rainMm: 0,
    snowCm: 0,
    precipMm: 0,
    snowDepthM: o.snowDepthM ?? 0,
    code: 3,
    windKmh: wind,
    gustKmh: o.gust ?? Math.round(wind * 1.5),
    light: o.light ?? 'day',
    recent: o.recent ?? null,
    ...PRECIP[o.precip ?? 'none'],
    ...o.over,
  };
}

const WINTER: GarmentId[] = ['thermal', 'insulated-jacket', 'windproof-shell', 'winter-tights', 'mittens', 'toque', 'neck-warmer'];
const COLD_TOP: GarmentId[] = ['long-sleeve', 'light-jacket', 'tights', 'light-gloves', 'headband'];
const WET_COLD: GarmentId[] = ['long-sleeve', 'light-jacket', 'rain-shell', 'tights', 'light-gloves', 'headband'];

export const SCENARIOS: Scenario[] = [
  // ── Approved (spec §9) ────────────────────────────────────────────────
  { id: 'A1', season: 'spring', name: '15 °C, dry, calm', input: wx(15), expected: ['tee', 'shorts'] },
  { id: 'A2', season: 'fall', name: '10 °C, dry, 30 km/h', input: wx(10, { wind: 30 }), expected: ['long-sleeve', 'windbreaker', 'shorts'] },
  {
    id: 'A3',
    season: 'spring',
    name: '5 °C, steady rain',
    input: wx(5, { precip: 'steady rain', wind: 12 }),
    expected: ['long-sleeve', 'rain-shell', 'tights', 'light-gloves'],
  },
  { id: 'A4', season: 'winter', name: '0 °C, dry, 30 km/h', input: wx(0, { wind: 30 }), expected: COLD_TOP },
  { id: 'A5', season: 'winter', name: '−5 °C, light snow, calm', input: wx(-5, { precip: 'dry snow' }), expected: COLD_TOP },
  { id: 'A6', season: 'winter', name: '−10 °C, dry, 30 km/h', input: wx(-10, { wind: 30 }), expected: WINTER },
  { id: 'A7', season: 'winter', name: '0 °C, wet snow, windy', input: wx(0, { precip: 'wet snow', wind: 30 }), expected: WET_COLD },
  { id: 'A8', season: 'winter', name: '−20 °C, dry, 15 km/h', input: wx(-20, { wind: 15 }), expected: WINTER },
  { id: 'A9', season: 'spring', name: '7 °C, dry, calm', input: wx(7), expected: ['long-sleeve', 'shorts'] },
  { id: 'A10', season: 'fall', name: '2 °C, dry, calm', input: wx(2), expected: ['long-sleeve', 'tights', 'light-gloves'] },
  { id: 'A11', season: 'winter', name: '−3 °C, dry, calm', input: wx(-3), expected: COLD_TOP },
  { id: 'A12', season: 'spring', name: '15 °C, dry, 35 km/h', input: wx(15, { wind: 35 }), expected: ['tee', 'shorts'] },
  { id: 'A13', season: 'winter', name: '−3 °C, wet snow, 30 km/h', input: wx(-3, { precip: 'wet snow', wind: 30 }), expected: WET_COLD },
  { id: 'A14', season: 'fall', name: '12 °C, steady rain, calm', input: wx(12, { precip: 'steady rain' }), expected: ['tee', 'rain-shell', 'shorts'] },
  { id: 'A15', season: 'summer', name: '25 °C, humid, calm', input: wx(25, { dewPoint: 21 }), expected: ['singlet', 'shorts'] },
  { id: 'A16', season: 'winter', name: '−15 °C, dry, 40 km/h', input: wx(-15, { wind: 40 }), expected: WINTER },

  // ── Winter ────────────────────────────────────────────────────────────
  { id: 'W1', season: 'winter', name: 'Cold snap: −25 °C, clear, 10 km/h', input: wx(-25, { wind: 10 }) },
  { id: 'W2', season: 'winter', name: 'Arctic wind: −30 °C, 30 km/h', input: wx(-30, { wind: 30 }) },
  { id: 'W3', season: 'winter', name: '−12 °C, light snow, calm', input: wx(-12, { precip: 'dry snow' }) },
  { id: 'W4', season: 'winter', name: 'Snowstorm: −8 °C, heavy snow, 35 km/h', input: wx(-8, { precip: 'heavy snow', wind: 35 }) },
  {
    id: 'W5',
    season: 'winter',
    name: 'Day after a storm: −6 °C, clear, 20 cm on the ground',
    input: wx(-6, { snowDepthM: 0.2, recent: { wetMm: 0, snowCm: 18, wasAboveZero: false } }),
  },
  { id: 'W6', season: 'winter', name: 'Freezing rain: −2 °C', input: wx(-2, { precip: 'freezing rain', wind: 15 }) },
  {
    id: 'W7',
    season: 'winter',
    name: 'Refreeze: −4 °C after yesterday’s rain at +3',
    input: wx(-4, { recent: { wetMm: 6, snowCm: 0, wasAboveZero: true }, snowDepthM: 0.05 }),
  },
  { id: 'W8', season: 'winter', name: 'Rain on snowbanks: +1 °C, light rain', input: wx(1, { precip: 'light rain', snowDepthM: 0.15 }) },
  { id: 'W9', season: 'winter', name: '−11 °C, calm, sunny', input: wx(-11, { wind: 5 }) },
  { id: 'W10', season: 'winter', name: '−7 °C, 28 km/h', input: wx(-7, { wind: 28 }) },

  // ── Spring ────────────────────────────────────────────────────────────
  { id: 'S1', season: 'spring', name: '3 °C, steady rain, 30 km/h', input: wx(3, { precip: 'steady rain', wind: 30 }) },
  { id: 'S2', season: 'spring', name: '8 °C, sunny, calm', input: wx(8, { wind: 6 }) },
  { id: 'S3', season: 'spring', name: '10 °C, light showers', input: wx(10, { precip: 'light rain' }) },
  { id: 'S4', season: 'spring', name: '13 °C, dry, 40 km/h', input: wx(13, { wind: 40 }) },
  { id: 'S5', season: 'spring', name: '4 °C, overcast, calm', input: wx(4) },
  { id: 'S6', season: 'spring', name: 'April snow: −1 °C, wet snow', input: wx(-1, { precip: 'wet snow', wind: 15 }) },
  { id: 'S7', season: 'spring', name: '6 °C, 60 % chance, nothing measurable', input: wx(6, { precip: 'chance' }) },

  // ── Summer ────────────────────────────────────────────────────────────
  { id: 'U1', season: 'summer', name: '18 °C, light rain', input: wx(18, { precip: 'light rain', dewPoint: 15 }) },
  { id: 'U2', season: 'summer', name: '22 °C, dry, humidex ~26', input: wx(22, { dewPoint: 13 }) },
  { id: 'U3', season: 'summer', name: '27 °C, muggy (dew point 22)', input: wx(27, { dewPoint: 22 }) },
  { id: 'U4', season: 'summer', name: 'Heat wave: 31 °C, dew point 24', input: wx(31, { dewPoint: 24 }) },
  { id: 'U5', season: 'summer', name: '24 °C, thunderstorm', input: wx(24, { precip: 'thunderstorm', dewPoint: 20, wind: 30 }) },
  { id: 'U6', season: 'summer', name: '20 °C, heavy rain', input: wx(20, { precip: 'heavy rain', dewPoint: 18 }) },
  { id: 'U7', season: 'summer', name: '16 °C, evening, dark', input: wx(16, { light: 'dark', dewPoint: 10 }) },

  // ── Fall ──────────────────────────────────────────────────────────────
  { id: 'F1', season: 'fall', name: '9 °C, drizzle, 30 km/h', input: wx(9, { precip: 'drizzle', wind: 30 }) },
  { id: 'F2', season: 'fall', name: '6 °C, calm, getting dark', input: wx(6, { light: 'dusk' }) },
  { id: 'F3', season: 'fall', name: '11 °C, steady rain, 25 km/h', input: wx(11, { precip: 'steady rain', wind: 25 }) },
  { id: 'F4', season: 'fall', name: 'First frost: 0 °C, clear, calm', input: wx(0, { wind: 4 }) },
  { id: 'F5', season: 'fall', name: '14 °C, dry, 20 km/h', input: wx(14, { wind: 20 }) },
  { id: 'F6', season: 'fall', name: '2 °C, wet snow', input: wx(2, { precip: 'wet snow' }) },
  {
    id: 'F7',
    season: 'fall',
    name: 'Forecast gap: 5 °C, wind and rain unknown',
    input: wx(5, { over: { windKmh: null, gustKmh: null, rainMm: null, snowCm: null, precipMm: null } }),
  },
];
