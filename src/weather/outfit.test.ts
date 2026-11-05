import { describe, expect, it } from 'vitest';
import { MODIFIERS, RUN_FEEL_OFFSET_C, TIERS, whatToWear, type OutfitInput } from './outfit';

/** Dry, calm, overcast daytime weather with a given feels-like temperature. */
const base = (feelsC: number, over: Partial<OutfitInput> = {}): OutfitInput => ({
  tempC: feelsC,
  feelsC,
  precipProb: 0,
  rainMm: 0,
  snowCm: 0,
  snowDepthM: 0,
  code: 3,
  windKmh: 5,
  gustKmh: 10,
  uvIndex: 0,
  light: 'day',
  ...over,
});
const ids = (input: OutfitInput) => whatToWear(input).items.map((i) => i.id);
/** Feels-like temperature that gives a chosen run feel. */
const feel = (runFeel: number) => runFeel - RUN_FEEL_OFFSET_C;

describe('tiers (dress for the run feel = feels-like + offset)', () => {
  it('run feel is feels-like plus the offset', () => {
    expect(RUN_FEEL_OFFSET_C).toBe(7);
    expect(whatToWear(base(10)).runFeelC).toBe(17);
  });

  it.each([
    [30, 'hot', ['singlet', 'shorts', 'cap', 'sunglasses']],
    [25, 'hot', ['singlet', 'shorts', 'cap', 'sunglasses']],
    [24.9, 'warm', ['tee', 'shorts', 'cap']],
    [18, 'warm', ['tee', 'shorts', 'cap']],
    [17, 'mild', ['tee', 'shorts']],
    [10, 'mild', ['tee', 'shorts']],
    [9, 'cool', ['long-sleeve', 'tights', 'light-gloves']],
    [3, 'cool', ['long-sleeve', 'tights', 'light-gloves']],
    [2, 'cold', ['long-sleeve', 'light-jacket', 'tights', 'gloves', 'headband']],
    [-4, 'cold', ['long-sleeve', 'light-jacket', 'tights', 'gloves', 'headband']],
    [-5, 'very-cold', ['thermal-layers', 'windproof-shell', 'toque', 'mittens', 'neck-warmer']],
  ])('run feel %s °C → %s', (runFeel, tier, items) => {
    const o = whatToWear(base(feel(runFeel)));
    expect(o.tier).toBe(tier);
    expect(o.items.map((i) => i.id)).toEqual(items);
  });

  it('the mild tier offers a tee or a light long sleeve', () => {
    expect(whatToWear(base(feel(12))).items[0].label).toBe('Tee or light long sleeve');
  });

  it('tiers are ordered from warmest to coldest', () => {
    const mins = TIERS.map((t) => t.minC);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
  });

  it('always says to bring an extra layer for the wait, and has a text headline', () => {
    const o = whatToWear(base(5));
    expect(o.notes.at(-1)).toBe('Bring an extra layer for the wait at the start.');
    expect(o.headline).toBe('Mild: tee or light long sleeve, shorts.');
  });
});

describe('modifiers', () => {
  it('rain → raincoat and a brimmed cap', () => {
    const o = whatToWear(base(8, { precipProb: 70, code: 61, rainMm: 1.2 }));
    expect(o.items.map((i) => i.id)).toEqual(expect.arrayContaining(['raincoat', 'cap']));
    expect(o.items.find((i) => i.id === 'cap')?.label).toMatch(/brim/);
    expect(o.notes[0]).toBe('Rain likely (70 % chance).');
    expect(o.headline).toMatch(/Rain likely\.$/);
  });

  it('a 40 % chance alone is not rain gear; 50 % is', () => {
    expect(ids(base(8, { precipProb: MODIFIERS.rainChancePct - 10 }))).not.toContain('raincoat');
    expect(ids(base(8, { precipProb: MODIFIERS.rainChancePct }))).toContain('raincoat');
  });

  it('rain in the cold swaps the light jacket for a raincoat', () => {
    const items = ids(base(feel(0), { tempC: 4, precipProb: 80, code: 63 }));
    expect(items).toContain('raincoat');
    expect(items).not.toContain('light-jacket');
  });

  it('strong wind → windbreaker; with a jacket already, a zip-up note instead', () => {
    const o = whatToWear(base(10, { windKmh: 30, gustKmh: 45 }));
    expect(o.items.map((i) => i.id)).toContain('windbreaker');
    expect(o.notes.join(' ')).toMatch(/Windy \(30 km\/h, gusts 45 km\/h\)/);
    const cold = whatToWear(base(feel(0), { windKmh: 10, gustKmh: MODIFIERS.gustKmh }));
    expect(cold.items.map((i) => i.id)).not.toContain('windbreaker');
    expect(cold.notes.join(' ')).toMatch(/zip your jacket up/);
  });

  it('high UV → sunglasses and sunscreen; moderate UV → sunscreen note only', () => {
    const high = whatToWear(base(12, { uvIndex: 7.4 }));
    expect(high.items.map((i) => i.id)).toContain('sunglasses');
    expect(high.notes.join(' ')).toMatch(/Strong sun \(estimated UV 7\)/);
    const moderate = whatToWear(base(12, { uvIndex: 4 }));
    expect(moderate.items.map((i) => i.id)).not.toContain('sunglasses');
    expect(moderate.notes.join(' ')).toMatch(/Some sun \(estimated UV 4\)/);
  });

  it('snow → grippy shoes and a slippery note, no raincoat', () => {
    const o = whatToWear(base(-8, { tempC: -5, snowCm: 1.5, code: 73, precipProb: 90 }));
    expect(o.items.map((i) => i.id)).toContain('grippy-shoes');
    expect(o.items.map((i) => i.id)).not.toContain('raincoat');
    expect(o.notes.join(' ')).toMatch(/Slippery/);
    expect(o.headline).toMatch(/Very cold.*Snow, slippery|Slippery/i);
  });

  it('freezing rain or snow on the ground → slippery', () => {
    expect(ids(base(-2, { tempC: -1, code: 66 }))).toContain('grippy-shoes');
    expect(ids(base(-2, { tempC: -1, snowDepthM: 0.05 }))).toContain('grippy-shoes');
    expect(ids(base(-2, { tempC: 0.5, precipProb: 60 }))).toContain('grippy-shoes');
    expect(ids(base(10, { tempC: 12 }))).not.toContain('grippy-shoes');
  });

  it('dark at run time → reflective vest and headlamp; dusk → vest', () => {
    const dark = whatToWear(base(10, { light: 'dark' }));
    expect(dark.items.map((i) => i.id)).toEqual(expect.arrayContaining(['reflective-vest', 'headlamp']));
    expect(dark.notes.join(' ')).toMatch(/Dark at run time/);
    const dusk = whatToWear(base(10, { light: 'dusk' }));
    expect(dusk.items.map((i) => i.id)).toContain('reflective-vest');
    expect(dusk.items.map((i) => i.id)).not.toContain('headlamp');
  });

  it('never lists an item twice', () => {
    const o = whatToWear(base(feel(30), { precipProb: 90, code: 81, windKmh: 40, gustKmh: 60, uvIndex: 9, light: 'dusk' }));
    const all = o.items.map((i) => i.id);
    expect(new Set(all).size).toBe(all.length);
  });
});
