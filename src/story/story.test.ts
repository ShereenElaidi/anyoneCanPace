import { describe, expect, it } from 'vitest';
import fixture from '../weather/fixtures/gem-2026-11-04.json';
import { parseGem, type Forecast } from '../weather/forecast';
import { whatToWear } from '../weather/outfit';
import { SCENARIOS } from '../weather/scenarios';
import { EVENT, nextRun } from '../event/event';
import { outfitInputFor } from '../weather/runTime';
import { makeSnapshot, type StorySnapshot } from './snapshot';
import { MIN_MAP_SCALE, MAP_PICTURE, SAFE, STORY, storyLayout, storyNote, textWidth, wrap, type Op } from './layout';

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
const box = (o: Op) =>
  o.kind === 'text'
    ? { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.size * 1.2 }
    : { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };

describe('layout: every scenario fits a 1080 × 1920 story', () => {
  it.each(SCENARIOS.map((sc) => [`${sc.id} ${sc.name}`, sc] as const))('%s', (_n, sc) => {
    const ops = storyLayout(snap(sc.input));
    for (const o of keyOps(ops)) {
      const b = box(o);
      // Inside Instagram's safe area and the side margins (the welcome pill and map may reach the margin).
      expect(b.y0, `${o.kind} top`).toBeGreaterThanOrEqual(SAFE.top);
      expect(b.y1, `${o.kind} bottom`).toBeLessThanOrEqual(SAFE.bottom);
      expect(b.x0).toBeGreaterThanOrEqual(SAFE.side - 0.01);
      expect(b.x1).toBeLessThanOrEqual(STORY.width - SAFE.side + 0.01);
      // Text never runs past its box.
      if (o.kind === 'text') expect(textWidth(o.text, o.size, o.font), o.text).toBeLessThanOrEqual(o.w + 0.01);
    }
    const map = ops.find((o) => o.kind === 'map')!;
    expect(map.kind === 'map' && map.w / MAP_PICTURE.width).toBeGreaterThanOrEqual(MIN_MAP_SCALE);
    // Key text lines don't overlap each other.
    const texts = keyOps(ops).filter((o) => o.kind === 'text').map(box);
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const [a, b] = [texts[i], texts[j]];
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 - 2 && b.y0 < a.y1 - 2;
        expect(overlap, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(false);
      }
  });

  it('says what the website says: headline, date, times, outfit labels, place', () => {
    const sc = SCENARIOS.find((x) => x.id === 'A7')!;
    const s = snap(sc.input);
    const all = storyLayout(s)
      .filter((o) => o.kind === 'text')
      .map((o) => (o as Extract<Op, { kind: 'text' }>).text)
      .join('\n');
    expect(all).toContain('SEE YOU SUNDAY!');
    expect(all).toContain('Sunday, November 8 · meet 10:00, run 10:15');
    const flat = all.replace(/\n/g, ' ').replace(/\u00a0/g, ' ');
    expect(flat).toContain(s.outfit.wear.map((i) => i.label).join(' · '));
    expect(flat).toContain('Café Tranquille · at the café entrance, 1442 Rue Clark');
    expect(all).toContain("New here? You're welcome!");
    expect(flat).toMatch(/Forecast from Sat/);
    expect(flat).toContain('© OpenStreetMap contributors');
  });

  it('the note is the most serious advisory, else what to bring', () => {
    expect(storyNote(snap(SCENARIOS.find((x) => x.id === 'A16')!.input))).toMatch(/^Warning: Wind chill/);
    expect(storyNote(snap(SCENARIOS.find((x) => x.id === 'A4')!.input))).toMatch(/^Bring: a warm layer/);
    expect(storyNote(snap(SCENARIOS.find((x) => x.id === 'A1')!.input))).toBeNull();
  });

  it('the duck is drawn from the snapshot’s outfit (the same pieces as the website)', () => {
    const ops = storyLayout(snap(SCENARIOS[0].input));
    expect(ops.filter((o) => o.kind === 'duck')).toHaveLength(1);
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
