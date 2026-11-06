import { describe, expect, it } from 'vitest';
import { ACCESSORIES, CUTOFFS, whatToWear, WIND, type GarmentId, type OutfitInput } from './outfit';
import { humidex, windChill } from './indices';

/** Dry, calm, overcast daytime weather at an air temperature. Feels-like is deliberately odd to prove it's ignored. */
const wx = (tempC: number, over: Partial<OutfitInput> = {}): OutfitInput => ({
  tempC,
  feelsC: tempC - 9,
  dewPointC: null,
  precipProb: 0,
  rainMm: 0,
  snowCm: 0,
  precipMm: 0,
  snowDepthM: 0,
  code: 3,
  windKmh: 8,
  gustKmh: 15,
  light: 'day',
  recent: null,
  ...over,
});
const wear = (input: OutfitInput) => whatToWear(input).wear.map((i) => i.id);
const opt = (input: OutfitInput) => whatToWear(input).optional.map((o) => o.id);
const windy = { windKmh: 30, gustKmh: 45 };
const steadyRain = { code: 63, rainMm: 2, precipMm: 2, precipProb: 90 };
const lightRain = { code: 61, rainMm: 0.5, precipMm: 0.5, precipProb: 70 };
const heavyRain = { code: 65, rainMm: 6, precipMm: 6, precipProb: 100 };
const wetSnow = { code: 73, snowCm: 1, rainMm: 0.4, precipMm: 1.5, precipProb: 90 };
const drySnow = { code: 71, snowCm: 0.4, precipMm: 0.3, precipProb: 80 };

describe('indices (Environment Canada)', () => {
  it.each([
    [-20, 30, -33],
    [-10, 20, -18],
    [-15, 40, -27],
  ])('wind chill %s °C at %s km/h ≈ %s', (t, v, expected) => expect(Math.round(windChill(t, v))).toBe(expected));

  it('wind chill is the air temperature when warm or calm', () => {
    expect(windChill(12, 30)).toBe(12);
    expect(windChill(-5, 3)).toBe(-5);
  });

  it.each([
    [30, 15, 34],
    [30, 25, 42],
    [25, 20, 33],
  ])('humidex %s °C, dew point %s ≈ %s', (t, td, expected) => expect(Math.round(humidex(t, td))).toBe(expected));
});

describe('base outfit follows the air temperature, not feels-like', () => {
  it.each<[number, GarmentId[]]>([
    [26, ['singlet', 'shorts']],
    [25, ['singlet', 'shorts']],
    [24.9, ['tee', 'shorts']],
    [12, ['tee', 'shorts']],
    [11.9, ['long-sleeve', 'shorts']],
    [7, ['long-sleeve', 'shorts']],
    [6.9, ['long-sleeve', 'tights']],
    [5.1, ['long-sleeve', 'tights']],
    [5, ['long-sleeve', 'tights', 'light-gloves']],
    [2, ['long-sleeve', 'tights', 'light-gloves']],
    [1.9, ['long-sleeve', 'light-jacket', 'tights', 'light-gloves']],
    [0.1, ['long-sleeve', 'light-jacket', 'tights', 'light-gloves']],
    [0, ['long-sleeve', 'light-jacket', 'tights', 'light-gloves', 'headband']],
    [-5, ['long-sleeve', 'light-jacket', 'tights', 'light-gloves', 'headband']],
    [-5.1, ['thermal', 'light-jacket', 'tights', 'light-gloves', 'headband']],
    [-9.9, ['thermal', 'light-jacket', 'tights', 'light-gloves', 'headband']],
    [-10, ['thermal', 'light-jacket', 'tights', 'mittens', 'toque', 'neck-warmer']],
    [-12, ['thermal', 'light-jacket', 'tights', 'mittens', 'toque', 'neck-warmer']],
    [
      -12.1,
      ['thermal', 'insulated-jacket', 'windproof-shell', 'winter-tights', 'mittens', 'toque', 'neck-warmer'],
    ],
  ])('%s °C → %j', (t, ids) => expect(wear(wx(t))).toEqual(ids));

  it('feels-like never changes the clothes', () => {
    expect(wear(wx(7, { feelsC: -10 }))).toEqual(wear(wx(7, { feelsC: 20 })));
  });

  it('cutoffs and accessories are ordered sensibly', () => {
    expect(CUTOFFS.longSleeve > CUTOFFS.tights && CUTOFFS.tights > CUTOFFS.jacket).toBe(true);
    expect(CUTOFFS.jacket > CUTOFFS.thermal && CUTOFFS.thermal > CUTOFFS.winter).toBe(true);
    expect(ACCESSORIES.lightGloves > ACCESSORIES.headband && ACCESSORIES.headband > ACCESSORIES.deepCold).toBe(true);
  });

  it('humidex ≥ 30 means a singlet even under 25 °C', () => {
    expect(wear(wx(23, { dewPointC: 21 }))[0]).toBe('singlet');
    expect(wear(wx(23, { dewPointC: 10 }))[0]).toBe('tee');
  });
});

describe('"Run cold?" options in the 2 °C above each cutoff, inclusive', () => {
  it.each<[number, GarmentId[]]>([
    [14.1, []],
    [14, ['long-sleeve']],
    [12, ['long-sleeve']],
    [9.1, []],
    [9, ['tights']],
    [7, ['tights']],
    [6.9, []],
    [4.1, []],
    [4, ['light-jacket']],
    [2, ['light-jacket']],
    [1.9, []],
    [-2.9, []],
    [-3, ['thermal']],
    [-5, ['thermal']],
    [-5.1, []],
    [-10, ['insulated-jacket', 'thermal-socks']],
    [-12, ['insulated-jacket', 'thermal-socks']],
    [-12.1, ['thermal-socks']],
  ])('%s °C → %j', (t, ids) => expect(opt(wx(t))).toEqual(ids));

  it('options are never in the outfit or on the duck', () => {
    for (let t = -25; t <= 30; t += 0.5) {
      const o = whatToWear(wx(t));
      for (const { id } of o.optional) expect(o.wear.map((i) => i.id)).not.toContain(id);
    }
  });
});

describe('accessories', () => {
  it('mittens replace light gloves and the toque replaces the headband at −10', () => {
    expect(wear(wx(-9.9))).toEqual(expect.arrayContaining(['light-gloves', 'headband']));
    const deep = wear(wx(-10));
    expect(deep).toEqual(expect.arrayContaining(['mittens', 'toque', 'neck-warmer']));
    expect(deep).not.toContain('light-gloves');
    expect(deep).not.toContain('headband');
  });

  it('never suggests a cap, in rain or sun', () => {
    for (const input of [wx(18, lightRain), wx(30), wx(10, heavyRain)]) {
      expect(whatToWear(input).drawn).not.toContain('cap');
    }
  });
});

describe('wind (sustained ≥ 25 km/h; gusts alone do nothing)', () => {
  it('24.9 km/h is calm, 25 is windy', () => {
    expect(wear(wx(10, { windKmh: 24.9, gustKmh: 60 }))).not.toContain('windbreaker');
    expect(wear(wx(10, { windKmh: WIND.windyKmh, gustKmh: 30 }))).toContain('windbreaker');
  });

  it('15 °C and up: a note, no garment; just under 15: windbreaker', () => {
    const o = whatToWear(wx(15, { windKmh: 35, gustKmh: 50 }));
    expect(o.wear.map((i) => i.id)).toEqual(['tee', 'shorts']);
    expect(o.advisories.map((a) => a.text).join(' ')).toMatch(/warm up/);
    expect(wear(wx(14.9, windy))).toContain('windbreaker');
  });

  it('−8 to 2 °C: the light jacket is windproof, no extra windbreaker', () => {
    const o = whatToWear(wx(0, windy));
    expect(o.wear.find((i) => i.id === 'light-jacket')?.label).toBe('Windproof light jacket');
    expect(o.wear.map((i) => i.id)).not.toContain('windbreaker');
  });

  it('windy below −8 brings the winter outfit early', () => {
    expect(wear(wx(-8, windy))).toContain('light-jacket');
    expect(wear(wx(-8.1, windy))).toEqual(expect.arrayContaining(['insulated-jacket', 'windproof-shell', 'winter-tights']));
  });

  it('windy −5 to −10: neck warmer offered', () => {
    expect(opt(wx(-5, windy))).toContain('neck-warmer');
    expect(opt(wx(-4.9, windy))).not.toContain('neck-warmer');
  });
});

describe('rain and wet snow', () => {
  it('15 °C and up: light and steady rain need no shell; heavy rain a light one', () => {
    expect(wear(wx(18, lightRain))).toEqual(['tee', 'shorts']);
    expect(wear(wx(15, steadyRain))).toEqual(['tee', 'shorts']);
    const heavy = whatToWear(wx(15, heavyRain));
    expect(heavy.wear.find((i) => i.id === 'rain-shell')?.label).toBe('Light rain shell');
  });

  it('2 to 15 °C: a rain shell, whatever the intensity', () => {
    expect(wear(wx(14.9, lightRain))).toContain('rain-shell');
    expect(wear(wx(2, steadyRain))).toContain('rain-shell');
  });

  it('below 2 °C: a waterproof shell over the light jacket', () => {
    const o = whatToWear(wx(0, steadyRain));
    expect(o.wear.map((i) => i.id)).toEqual(expect.arrayContaining(['light-jacket', 'rain-shell']));
    expect(o.wear.find((i) => i.id === 'rain-shell')?.label).toBe('Waterproof shell');
    expect(o.drawn).toContain('raincoat');
    expect(o.drawn).not.toContain('light-jacket');
  });

  it('winter + wet: the waterproof shell replaces the windproof one', () => {
    const ids = wear(wx(-14, wetSnow));
    expect(ids).toContain('rain-shell');
    expect(ids).not.toContain('windproof-shell');
  });

  it('rain + wind → one rain shell, never a windbreaker too', () => {
    const ids = wear(wx(10, { ...steadyRain, ...windy }));
    expect(ids).toContain('rain-shell');
    expect(ids).not.toContain('windbreaker');
  });

  it('a chance of rain alone is a note, not gear', () => {
    const o = whatToWear(wx(10, { precipProb: 60 }));
    expect(o.wear.map((i) => i.id)).not.toContain('rain-shell');
    expect(o.advisories.map((a) => a.text)).toContain('60 % chance of rain or snow.');
    expect(whatToWear(wx(10, { precipProb: 39 })).advisories).toEqual([]);
  });

  it('snow at −2 °C is wet, at −2.1 °C dry; dry snow changes no clothes', () => {
    expect(whatToWear(wx(-2, drySnow)).conditions).toContain('wet-snow');
    const dry = whatToWear(wx(-2.1, drySnow));
    expect(dry.conditions).toContain('snow');
    expect(dry.wear).toEqual(whatToWear(wx(-2.1)).wear);
    expect(dry.advisories.map((a) => a.text)).toContain('Snow expected. Paths may be slippery.');
  });

  it('freezing rain is a warning', () => {
    const o = whatToWear(wx(-1, { code: 66, precipMm: 1 }));
    expect(o.advisories[0]).toMatchObject({ level: 'warning', text: expect.stringMatching(/Freezing rain/) });
    expect(o.wear.map((i) => i.id)).toContain('rain-shell');
  });
});

describe('ground: forecast words only, never on the duck', () => {
  it('snow on the ground or a big recent snowfall → grip note', () => {
    const text = (i: OutfitInput) => whatToWear(i).advisories.map((a) => a.text).join(' ');
    expect(text(wx(-5, { snowDepthM: 0.05 }))).toMatch(/Snow on the ground/);
    expect(text(wx(-5, { recent: { wetMm: 0, snowCm: 3, wasAboveZero: false } }))).toMatch(/Snow on the ground/);
  });

  it('refreeze: wet in the last day, above 0 then, at or below 0 now', () => {
    const recent = { wetMm: 3, snowCm: 0, wasAboveZero: true };
    expect(whatToWear(wx(-1, { recent })).advisories[0].text).toMatch(/refreeze/);
    expect(whatToWear(wx(1, { recent })).advisories).toEqual([]);
    expect(whatToWear(wx(-1, { recent: { ...recent, wasAboveZero: false } })).advisories).toEqual([]);
  });

  it('never draws grip shoes', () => {
    expect(whatToWear(wx(-5, { snowDepthM: 0.2, ...drySnow })).drawn).not.toContain('grippy-shoes');
  });
});

describe('bring', () => {
  const bring = (i: OutfitInput) => whatToWear(i).bring.join(' ');
  it('waiting layer at 0 °C or below, or up to 5 °C when wet or windy', () => {
    expect(bring(wx(0))).toMatch(/warm layer/);
    expect(bring(wx(0.1))).toBe('');
    expect(bring(wx(5, windy))).toMatch(/warm layer/);
    expect(bring(wx(5, steadyRain))).toMatch(/warm layer/);
    expect(bring(wx(5.1, steadyRain))).toBe('');
  });

  it('dry clothes after when cold, or cool and wet', () => {
    expect(bring(wx(0))).toMatch(/Dry clothes/);
    expect(bring(wx(5, steadyRain))).toMatch(/Dry clothes/);
    expect(bring(wx(5, windy))).not.toMatch(/Dry clothes/);
  });
});

describe('warnings', () => {
  it('frostbite at wind chill −27 or colder; never says cancel', () => {
    const o = whatToWear(wx(-15, { windKmh: 40, gustKmh: 60 }));
    expect(o.advisories[0]).toMatchObject({ level: 'warning', text: expect.stringMatching(/frostbite/) });
    expect(o.advisories.map((a) => a.text).join(' ')).not.toMatch(/cancel/i);
    expect(whatToWear(wx(-15, { windKmh: 30 })).conditions).not.toContain('frostbite');
    expect(whatToWear(wx(-35, { windKmh: 30 })).advisories[0].text).toMatch(/under 10 minutes/);
  });

  it('heat: advice at humidex 30, stronger at 35', () => {
    expect(whatToWear(wx(25, { dewPointC: 12 })).conditions).not.toContain('heat');
    expect(whatToWear(wx(27, { dewPointC: 17 })).advisories[0]).toMatchObject({ level: 'caution' });
    expect(whatToWear(wx(30, { dewPointC: 20 })).advisories[0]).toMatchObject({ level: 'warning' });
  });

  it('dark at run time → vest and headlamp; dusk → vest', () => {
    expect(wear(wx(10, { light: 'dark' }))).toEqual(expect.arrayContaining(['reflective-vest', 'headlamp']));
    expect(wear(wx(10, { light: 'dusk' }))).toContain('reflective-vest');
    expect(wear(wx(10, { light: 'dusk' }))).not.toContain('headlamp');
  });
});

describe('missing data is unknown, not zero', () => {
  it('unknown wind and precipitation: outfit from temperature, plus a note', () => {
    const o = whatToWear(wx(5, { windKmh: null, gustKmh: null, rainMm: null, snowCm: null, precipMm: null }));
    expect(o.wear.map((i) => i.id)).toEqual(['long-sleeve', 'tights', 'light-gloves']);
    expect(o.advisories.at(-1)?.text).toBe('Wind and rain or snow unknown in this forecast: check outside.');
  });
});

describe('the duck draws a subset of the written outfit', () => {
  it('legs, the outermost top, hands, head, neck and visibility; at most one jacket', () => {
    const inputs: OutfitInput[] = [];
    for (let t = -30; t <= 32; t += 1) {
      for (const extra of [{}, windy, lightRain, steadyRain, heavyRain, wetSnow, drySnow, { light: 'dark' as const }]) {
        inputs.push(wx(t, extra));
      }
    }
    const art: Record<string, GarmentId> = { raincoat: 'rain-shell', 'thermal-layers': 'winter-tights' };
    for (const input of inputs) {
      const o = whatToWear(input);
      const written = o.wear.map((i) => i.id);
      for (const piece of o.drawn) expect(written).toContain(art[piece] ?? piece);
      const jackets = o.drawn.filter((p) => ['light-jacket', 'windbreaker', 'windproof-shell', 'raincoat'].includes(p));
      expect(jackets.length).toBeLessThanOrEqual(1);
      expect(new Set(written).size).toBe(written.length);
      expect(o.headline).toMatch(/\.$/);
    }
  });
});

describe('approved scenarios (design/weather-v1-spec.md §9)', () => {
  it.each<[string, OutfitInput, GarmentId[], RegExp?]>([
    ['1. 15, dry, calm', wx(15), ['tee', 'shorts']],
    ['2. 10, dry, 30 km/h', wx(10, windy), ['long-sleeve', 'windbreaker', 'shorts']],
    ['3. 5, steady rain', wx(5, steadyRain), ['long-sleeve', 'rain-shell', 'tights', 'light-gloves']],
    ['4. 0, dry, 30 km/h', wx(0, windy), ['long-sleeve', 'light-jacket', 'tights', 'light-gloves', 'headband']],
    ['5. −5, light dry snow', wx(-5, drySnow), ['long-sleeve', 'light-jacket', 'tights', 'light-gloves', 'headband']],
    [
      '6. −10, dry, 30 km/h',
      wx(-10, windy),
      ['thermal', 'insulated-jacket', 'windproof-shell', 'winter-tights', 'mittens', 'toque', 'neck-warmer'],
    ],
    [
      '7. 0, wet snow, windy',
      wx(0, { ...wetSnow, ...windy }),
      ['long-sleeve', 'light-jacket', 'rain-shell', 'tights', 'light-gloves', 'headband'],
    ],
    [
      '8. −20, dry, 15 km/h',
      wx(-20, { windKmh: 15 }),
      ['thermal', 'insulated-jacket', 'windproof-shell', 'winter-tights', 'mittens', 'toque', 'neck-warmer'],
      /frostbite/,
    ],
    ['9. 7, dry, calm', wx(7), ['long-sleeve', 'shorts']],
    ['10. 2, dry, calm', wx(2), ['long-sleeve', 'tights', 'light-gloves']],
    ['11. −3, dry, calm', wx(-3), ['long-sleeve', 'light-jacket', 'tights', 'light-gloves', 'headband']],
    ['12. 15, dry, 35 km/h', wx(15, { windKmh: 35 }), ['tee', 'shorts']],
    [
      '13. −3, wet snow, 30 km/h',
      wx(-3, { ...wetSnow, ...windy }),
      ['long-sleeve', 'light-jacket', 'rain-shell', 'tights', 'light-gloves', 'headband'],
    ],
    ['14. 12, steady rain', wx(12, steadyRain), ['tee', 'rain-shell', 'shorts']],
    ['15. 25, humid', wx(25, { dewPointC: 21 }), ['singlet', 'shorts'], /Humidex/],
    [
      '16. −15, dry, 40 km/h',
      wx(-15, { windKmh: 40 }),
      ['thermal', 'insulated-jacket', 'windproof-shell', 'winter-tights', 'mittens', 'toque', 'neck-warmer'],
      /frostbite/,
    ],
  ])('%s', (_name, input, ids, advice) => {
    const o = whatToWear(input);
    expect(o.wear.map((i) => i.id)).toEqual(ids);
    if (advice) expect(o.advisories.map((a) => a.text).join(' ')).toMatch(advice);
  });

  it('scenario options and extras', () => {
    expect(opt(wx(7))).toEqual(['tights']);
    expect(opt(wx(2))).toEqual(['light-jacket']);
    expect(opt(wx(-3))).toEqual(['thermal']);
    expect(opt(wx(-5, drySnow))).toEqual(['thermal']);
    expect(opt(wx(-3, { ...wetSnow, ...windy }))).toEqual(['thermal']);
    expect(whatToWear(wx(0, windy)).bring).toHaveLength(2);
    expect(opt(wx(-10, windy))).toContain('thermal-socks');
  });
});
