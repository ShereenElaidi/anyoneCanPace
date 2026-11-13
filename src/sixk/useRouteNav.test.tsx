import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offsetPoint, type LatLon } from '../nav/geo';
import { prepareRoute, type PreparedRoute } from '../nav/route';
import { walk } from '../nav/testing/replay';
import type { Fix, NavEvent } from '../nav/tracker';
import type { Turn } from '../nav/types';
import { playNavCue, vibrateNav } from '../lib/cues';
import { planDelivery } from './navDelivery';
import { useRouteNav } from './useRouteNav';

vi.mock('../lib/cues', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/cues')>();
  return { ...actual, playNavCue: vi.fn(), vibrateNav: vi.fn() };
});

const START: LatLon = { lat: 45.5, lon: -73.57 };

/** A route from legs of [bearing, metres], with turns at the corners. */
function routeFrom(legs: [number, number][], dirs: Turn['dir'][], streets: string[]): PreparedRoute {
  const pts: LatLon[] = [START];
  for (const [b, m] of legs) pts.push(offsetPoint(pts[pts.length - 1], b, m));
  let at = 0;
  const turns: Turn[] = dirs.map((dir, i) => {
    at += legs[i][1];
    return { atM: at, dir, street: streets[i] };
  });
  return prepareRoute(
    pts.map((p) => [p.lon, p.lat]),
    turns,
  );
}

/** Drives the real hook with fixes in real-time order, recording what the pacer would get. */
function drive(route: PreparedRoute, fixes: Fix[]) {
  const said: string[] = [];
  const hook = renderHook(({ fix }: { fix: Fix | null }) => useRouteNav(route, fix, { sound: true, vibration: true }), {
    initialProps: { fix: null as Fix | null },
  });
  const record = () => {
    const text = hook.result.current.announcement.trim();
    if (text && text !== said.at(-1)) said.push(text);
  };
  vi.setSystemTime(fixes[0].at);
  hook.rerender({ fix: fixes[0] });
  act(() => hook.result.current.start());
  record();
  for (const fix of fixes.slice(1)) {
    vi.setSystemTime(fix.at);
    hook.rerender({ fix });
    record();
  }
  return { said, hook };
}

const vibrations = () => vi.mocked(vibrateNav).mock.calls.map((c) => c[0]);
const beeps = () => vi.mocked(playNavCue).mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.mocked(vibrateNav).mockClear();
  vi.mocked(playNavCue).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('delivered cues and announcements', () => {
  for (const gap of [41, 60, 80]) {
    it(`turns ${gap} m apart: "left now" is not replaced by the next heads-up, and is said with it`, () => {
      // East 400 m, left (north) for `gap` m, right (east) 300 m.
      const route = routeFrom(
        [
          [90, 400],
          [0, gap],
          [90, 300],
        ],
        ['left', 'right'],
        ['Rue A', 'Rue B'],
      );
      const { said } = drive(route, walk(route, { fromM: 0, toM: 400 + gap + 200, startAt: 1_000_000 }));

      // Buzz and beep: heads-up left, left now, right now. Never the right turn's pattern before the left.
      expect(vibrations()).toEqual(['left', 'left', 'right']);
      expect(beeps()).toEqual(['left', 'left', 'right']);

      const leftNow = said.findIndex((t) => t.startsWith('Left on Rue A now'));
      expect(said.slice(0, leftNow).some((t) => t.includes('Rue B'))).toBe(false);
      expect(said).toContain('Left on Rue A in 150 metres.');
      const spoken = Math.round(gap / 5) * 5;
      expect(said[leftNow]).toBe(`Left on Rue A now, then right on Rue B in ${spoken} metres.`);
      expect(said).toContain('Right on Rue B now.');
      // The folded heads-up is not said again on its own.
      expect(said.some((t) => /^Right on Rue B in /.test(t))).toBe(false);
    });
  }

  it('turns far apart get their own heads-up, with that turn and its distance', () => {
    const route = routeFrom(
      [
        [90, 400],
        [0, 500],
        [90, 300],
      ],
      ['left', 'right'],
      ['Rue A', 'Rue B'],
    );
    const { said } = drive(route, walk(route, { fromM: 0, toM: 1100, startAt: 1_000_000 }));
    expect(said).toContain('Left on Rue A now.');
    expect(said).toContain('Right on Rue B in 150 metres.');
    expect(vibrations()).toEqual(['left', 'left', 'right', 'right']);
  });

  it('several events from one fix (start, join, heads-up): all said in order, one cue', () => {
    const route = routeFrom(
      [
        [90, 100],
        [0, 300],
      ],
      ['left'],
      ['Rue A'],
    );
    const { said } = drive(route, [{ ...START, accuracyM: 8, at: 1_000_000 }]);
    expect(said).toEqual(['Route started. On the route at 0.0 kilometres. Left on Rue A in 100 metres.']);
    expect(vibrations()).toEqual(['left']);
    expect(beeps()).toEqual(['left']);
  });
});

describe('planDelivery priorities', () => {
  const route = routeFrom(
    [
      [90, 400],
      [0, 60],
      [90, 300],
    ],
    ['left', 'right'],
    ['Rue A', 'Rue B'],
  );
  const now0: NavEvent = { kind: 'turn', stage: 'now', turnIndex: 0, at: 5, distanceM: 28 };
  const heads1: NavEvent = { kind: 'turn', stage: 'heads-up', turnIndex: 1, at: 5, distanceM: 88 };

  it('an immediate turn beats a heads-up, whatever the order', () => {
    expect(planDelivery(route, [heads1, now0]).cue).toEqual({ cue: 'left', at: 5 });
    expect(planDelivery(route, [now0, heads1]).cue).toEqual({ cue: 'left', at: 5 });
  });

  it('finishing beats a last turn; off route beats a heads-up', () => {
    expect(planDelivery(route, [now0, { kind: 'finished', at: 5 }]).cue?.cue).toBe('finished');
    expect(planDelivery(route, [heads1, { kind: 'off-route', at: 5 }]).cue?.cue).toBe('off-route');
  });

  it('skipped turns and back-on-route never buzz', () => {
    expect(planDelivery(route, [{ kind: 'turn-skipped', turnIndex: 0 }]).cue).toBeNull();
    const back = planDelivery(route, [{ kind: 'back-on-route', at: 5 }]);
    expect(back).toEqual({ text: 'Back on route.', cue: null });
  });
});
