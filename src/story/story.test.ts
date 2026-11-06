import { describe, expect, it } from 'vitest';
import fixture from '../weather/fixtures/gem-2026-11-04.json';
import { parseGem, type Forecast } from '../weather/forecast';
import { whatToWear } from '../weather/outfit';
import { SCENARIOS } from '../weather/scenarios';
import { EVENT, nextRun } from '../event/event';
import { outfitInputFor } from '../weather/runTime';
import { makeSnapshot, type StorySnapshot } from './snapshot';
import {
  DUCK,
  MAP_PICTURE,
  mapPageLayout,
  SAFE,
  STICKER_SPACE_MIN,
  STORY,
  storyLayout,
  storyNote,
  storyPages,
  textWidth,
  wrap,
  type Op,
} from './layout';

/** Montréal local time in November 2026 (EST, UTC−5). */
const est = (d: number, h: number, min = 0) => Date.UTC(2026, 10, d, h + 5, min);
const DAY = 86_400_000;

/** The recorded forecast (Nov 4–5) moved 4 days later, so it covers Sunday Nov 8. */
function sundayForecast(): Forecast {
  const f = parseGem(fixture, est(7, 21));
  return { ...f, hours: f.hours.map((h) => ({ ...h, at: h.at + 4 * DAY })), days: f.days.map((d) => ({ ...d, date: d.date + 4 * DAY })) };
}

describe('snapshot', () => {
  it('Saturday night: the forecast hour containing Sunday’s 10:15 start, frozen', () => {
    const f = sundayForecast();
    const r = makeSnapshot(f, est(7, 21));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.snapshot;
    expect(s.run).toEqual(nextRun(est(7, 21)));
    expect(s.weather.hourAt).toBe(est(8, 10));
    expect(s.forecastFetchedAt).toBe(f.fetchedAt);
    expect(s.place).toEqual(EVENT.place);
    // The outfit is exactly the dashboard's for that hour.
    expect(s.outfit).toEqual(whatToWear(outfitInputFor(f, est(8, 10, 15))!));
  });

  it('too early in the week: says the forecast doesn’t reach the run yet', () => {
    const r = makeSnapshot(parseGem(fixture, est(4, 9)), est(4, 9));
    expect(r).toMatchObject({ ok: false, reason: 'not-covered', run: { date: '2026-11-08' } });
  });
});


/** A snapshot for any scenario, with the real event and a Saturday-night forecast time. */
function snap(i: (typeof SCENARIOS)[number]['input']): StorySnapshot {
  return {
    madeAt: est(7, 21),
    forecastFetchedAt: est(7, 21, 12),
    eventName: EVENT.name,
    weekday: EVENT.weekday,
    run: nextRun(est(7, 21)),
    place: EVENT.place,
    weather: { hourAt: est(8, 10), tempC: i.tempC, feelsC: i.feelsC, text: 'Thunderstorm with hail', windKmh: i.windKmh, precipProb: 90 },
    outfit: whatToWear(i),
  };
}

const keyOps = (ops: Op[]) => ops.filter((o) => o.role === 'key');
type Boxed = Exclude<Op, { kind: 'poly' }>;
const box = (o: Boxed) =>
  o.kind === 'text'
    ? { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.size * 1.2 }
    : { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
const texts = (ops: Op[]) => ops.filter((o): o is Extract<Op, { kind: 'text' }> => o.kind === 'text');
const flat = (ops: Op[]) =>
  texts(ops)
    .map((o) => o.text)
    .join(' ')
    .replace(/\u00a0/g, ' ');

/** Key content inside Instagram's safe area and margins, text inside its box, no two key lines overlapping. */
function expectFits(ops: Op[]) {
  const key = keyOps(ops).filter((o): o is Boxed => o.kind !== 'poly');
  for (const o of key) {
    const b = box(o);
    expect(b.y0, `${o.kind} top`).toBeGreaterThanOrEqual(SAFE.top);
    expect(b.y1, `${o.kind} bottom`).toBeLessThanOrEqual(SAFE.bottom);
    expect(b.x0).toBeGreaterThanOrEqual(SAFE.side - 0.01);
    expect(b.x1).toBeLessThanOrEqual(STORY.width - SAFE.side + 0.01);
    if (o.kind === 'text') expect(textWidth(o.text, o.size, o.font), o.text).toBeLessThanOrEqual(o.w + 0.01);
  }
  const lines = key.filter((o) => o.kind === 'text').map(box);
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = [lines[i], lines[j]];
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 - 2 && b.y0 < a.y1 - 2;
      expect(overlap, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(false);
    }
}

describe('page 1, the poster: every scenario fits a 1080 × 1920 story', () => {
  it.each(SCENARIOS.map((sc) => [`${sc.id} ${sc.name}`, sc] as const))('%s', (_n, sc) => {
    const ops = storyLayout(snap(sc.input));
    expectFits(ops);
    // The duck stays big: it only shrinks as far as DUCK.min to make room for the words.
    const duck = ops.find((o) => o.kind === 'rect' && o.radius !== undefined && o.w === o.h && o.radius === o.w / 2);
    expect(duck && duck.kind === 'rect' && duck.w).toBeGreaterThanOrEqual(DUCK.min);
    // Nothing key is drawn over the duck's circle (its own picture and rain or snow aside).
    const d = box(duck as Boxed);
    for (const o of keyOps(ops).filter((x): x is Boxed => x.kind !== 'poly' && x.kind !== 'duck' && x !== duck)) {
      const b = box(o);
      const inside = b.x0 < d.x1 && d.x0 < b.x1 && b.y0 < d.y1 && d.y0 < b.y1;
      // The bubble may touch the circle's top edge (its tail points at the duck).
      if (inside) expect(b.y1, `${o.kind} over the duck`).toBeLessThanOrEqual(d.y0 + 1);
    }
  });

  it('says what the website says: the outfit, date, times, the welcome, and points to the map page', () => {
    const s = snap(SCENARIOS.find((x) => x.id === 'A16')!.input);
    const all = flat(storyLayout(s));
    expect(all).toContain('SEE YOU SUNDAY!');
    expect(all).toContain('Sunday, November 8 · meet 10:00, run 10:15');
    expect(all).toContain('Dress like me!');
    // Every item the website lists, in words (layers, then "Also: …").
    for (const item of s.outfit.wear) expect(all.toLowerCase()).toContain(item.label.toLowerCase());
    expect(all).toContain('Also: mittens, toque, neck warmer.');
    expect(all).toMatch(/Warning: Wind chill/);
    expect(all).toContain('Meet at Café Tranquille: map on the next page');
    expect(all).toContain("New here? You're welcome!");
    expect(all).toMatch(/Forecast from Sat/);
    // Brand only in the footer (under Instagram's reply bar), not at the top.
    const brand = texts(storyLayout(s)).find((o) => o.text.includes('STOOOPIDS'));
    expect(brand?.role).toBe('footer');
  });

  it('the bubble is in the comic font; the duck is drawn once from the snapshot’s outfit', () => {
    const ops = storyLayout(snap(SCENARIOS[0].input));
    expect(texts(ops).find((o) => o.text === 'Dress like me!')?.font).toBe('comic');
    expect(ops.filter((o) => o.kind === 'duck')).toHaveLength(1);
  });

  it('the note is the most serious advisory, else what to bring', () => {
    expect(storyNote(snap(SCENARIOS.find((x) => x.id === 'A16')!.input))).toMatch(/^Warning: Wind chill/);
    expect(storyNote(snap(SCENARIOS.find((x) => x.id === 'A4')!.input))).toMatch(/^Bring: a warm layer/);
    expect(storyNote(snap(SCENARIOS.find((x) => x.id === 'A1')!.input))).toBeNull();
  });
});

describe('page 2, the map', () => {
  const s = snap(SCENARIOS[0].input);
  const ops = mapPageLayout(s);

  it('fits, with the map at full size and room under it for the Link sticker', () => {
    expectFits(ops);
    const map = ops.find((o) => o.kind === 'map')!;
    expect(map.kind === 'map' && map.w).toBe(MAP_PICTURE.width);
    expect(map.kind === 'map' && SAFE.bottom - (map.y + map.h)).toBeGreaterThanOrEqual(STICKER_SPACE_MIN);
  });

  it('says where and when', () => {
    const all = flat(ops);
    expect(all).toContain('Lost? Find your Flock?');
    expect(all).toContain('Café Tranquille');
    expect(all).toContain('At the café entrance, 1442 Rue Clark');
    expect(all).toContain('Sunday, November 8 · meet 10:00, run 10:15');
    expect(all).toContain('© OpenStreetMap contributors');
  });

  it('comes second', () => {
    const pages = storyPages(s);
    expect(pages).toHaveLength(2);
    expect(flat(pages[1])).toContain('Lost?');
  });
});

describe('wrap', () => {
  it('never breaks at a no-break space', () => {
    expect(wrap('wind 40\u00a0km/h', 10, 6 * 9)).toEqual(['wind', '40\u00a0km/h']);
  });

  it('breaks on words within a width', () => {
    expect(wrap('aaa bbb ccc', 10, 6 * 7)).toEqual(['aaa bbb', 'ccc']);
    expect(wrap('', 10, 100)).toEqual([]);
  });
});
