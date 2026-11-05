import { describe, expect, it } from 'vitest';
import { FINISH_FRACTION, OFF_ROUTE_MS, START_RADIUS_M } from './constants';
import { distanceM, offsetPoint } from './geo';
import { bearingAt, pointAt, prepareRoute } from './route';
import { approachInfo, begin, createNav, goRogue, update, type NavEvent } from './tracker';
import { describe as describeBanner } from './banner';
import { allRoutes, lastAt, line, replay, sampleRoute, walk } from './testing/replay';

const turnEvents = (events: NavEvent[]) =>
  events.filter((e): e is Extract<NavEvent, { kind: 'turn' }> => e.kind === 'turn');
const kinds = (events: NavEvent[]) => events.map((e) => e.kind);
const isMonotonic = (xs: number[]) => xs.every((x, i) => i === 0 || x >= xs[i - 1]);

describe('sample loop replay', () => {
  const route = sampleRoute();

  it('is the sample loop: ~6.4 km, start and finish about 37 m apart', () => {
    expect(route.lengthM).toBeGreaterThan(6300);
    expect(route.lengthM).toBeLessThan(6450);
    const gap = distanceM(route.points[0], route.points[route.points.length - 1]);
    expect(gap).toBeGreaterThan(30);
    expect(gap).toBeLessThan(45);
    expect(route.turns.length).toBeGreaterThan(3);
  });

  it('clean run: every turn cued once (heads-up then now), progress only forward, finishes at the end', () => {
    const fixes = walk(route, { fromM: 0, toM: route.lengthM });
    const r = replay(route, fixes);
    expect(isMonotonic(r.progress)).toBe(true);
    expect(kinds(r.events)).not.toContain('off-route');
    expect(kinds(r.events)).not.toContain('turn-skipped');

    const turns = turnEvents(r.events);
    route.turns.forEach((_, i) => {
      const forTurn = turns.filter((e) => e.turnIndex === i).map((e) => e.stage);
      // The first turn is under 150 m from the start, so it may get only "now".
      if (route.turns[i].atM > 150) expect(forTurn).toEqual(['heads-up', 'now']);
      else expect(forTurn.at(-1)).toBe('now');
    });
    // Cues fire in route order.
    const nowOrder = turns.filter((e) => e.stage === 'now').map((e) => e.turnIndex);
    expect(nowOrder).toEqual([...nowOrder].sort((a, b) => a - b));

    expect(r.state.status).toBe('finished');
    expect(kinds(r.events).filter((k) => k === 'finished')).toHaveLength(1);
    const finishedAt = r.events.findIndex((e) => e.kind === 'finished');
    expect(finishedAt).toBeGreaterThan(-1);
    expect(r.state.progressM).toBeGreaterThan(route.lengthM - 50);
  });

  it('jittery run (σ 8 m GPS error, 1 Hz): no false off-route, no repeated cues, still finishes', () => {
    const fixes = walk(route, { fromM: 0, toM: route.lengthM, jitterM: 8, seed: 42 });
    const r = replay(route, fixes);
    expect(isMonotonic(r.progress)).toBe(true);
    expect(kinds(r.events)).not.toContain('off-route');
    const turns = turnEvents(r.events);
    const keys = turns.map((e) => `${e.turnIndex}:${e.stage}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(turns.filter((e) => e.stage === 'now')).toHaveLength(route.turns.length);
    expect(r.state.status).toBe('finished');
  });

  it('jitter never drags progress backwards, even standing still', () => {
    const at = 2000;
    const still = walk(route, { fromM: at, toM: at, jitterM: 10, seed: 7 });
    const many = Array.from({ length: 60 }, (_, i) => ({ ...walk(route, { fromM: at, toM: at, jitterM: 10, seed: i + 1 })[0], at: i * 1000 }));
    const r = replay(route, [still[0], ...many.slice(1)]);
    expect(isMonotonic(r.progress)).toBe(true);
    expect(r.state.progressM).toBeLessThan(at + 40);
  });

  it('off-route detour: flagged after ~5 s, banner points back, recovers cleanly', () => {
    const toDetour = walk(route, { fromM: 0, toM: 2600 });
    let r = replay(route, toDetour);
    const progressBefore = r.state.progressM;

    // Walk 150 m sideways (to the left of travel) over 50 s, then come back.
    const here = pointAt(route, 2600);
    const away = offsetPoint(here, bearingAt(route, 2600) - 90, 150);
    const t0 = lastAt(toDetour) + 1000;
    const out = line(here, away, { startAt: t0, steps: 50 });
    r = replay(route, out, r.state);
    expect(kinds(r.events).filter((k) => k === 'off-route')).toHaveLength(1);
    expect(r.state.offRoute).toBe(true);
    expect(r.state.progressM).toBeLessThan(progressBefore + 20);
    const banner = describeBanner(route, r.state);
    expect(banner.primary).toMatch(/^Off route/);
    expect(banner.icon).toBe('bearing');
    expect(banner.secondary).toMatch(/Head \w+ to get back on the route/);

    // Saying "going rogue" calms the banner until they're back.
    const rogue = goRogue(r.state);
    expect(describeBanner(route, rogue).primary).toBe('Going rogue');

    const back = line(away, pointAt(route, 2700), { startAt: lastAt(out) + 1000, steps: 50 });
    const r2 = replay(route, back, rogue);
    expect(kinds(r2.events)).toContain('back-on-route');
    expect(r2.state.offRoute).toBe(false);
    expect(r2.state.rogue).toBe(false);

    const rest = walk(route, { fromM: 2700, toM: route.lengthM, startAt: lastAt(back) + 1000 });
    const r3 = replay(route, rest, r2.state);
    expect(r3.state.status).toBe('finished');
  });

  it('a short excursion (under 5 s) is not off route', () => {
    const toPoint = walk(route, { fromM: 0, toM: 1500 });
    const r = replay(route, toPoint);
    const here = pointAt(route, 1500);
    const away = offsetPoint(here, bearingAt(route, 1500) + 90, 60);
    const t0 = lastAt(toPoint) + 1000;
    const blip = [
      { ...away, accuracyM: 8, at: t0 },
      { ...away, accuracyM: 8, at: t0 + OFF_ROUTE_MS - 1500 },
    ];
    const r2 = replay(route, blip, r.state);
    expect(r2.state.offRoute).toBe(false);
    const after = walk(route, { fromM: 1505, toM: 1600, startAt: t0 + OFF_ROUTE_MS });
    const r3 = replay(route, after, r2.state);
    expect(kinds(r3.events)).not.toContain('off-route');
  });

  it('late joiner starting mid-way: progress starts there, earlier turns are skipped silently', () => {
    const joinAt = 3000;
    const fixes = walk(route, { fromM: joinAt, toM: route.lengthM, jitterM: 5, seed: 3 });
    const r = replay(route, fixes);
    expect(r.progress[0]).toBeGreaterThan(joinAt - 30);
    expect(r.progress[0]).toBeLessThan(joinAt + 30);
    const earlier = route.turns.map((t, i) => ({ t, i })).filter(({ t }) => t.atM < joinAt - 20);
    const cued = new Set(turnEvents(r.events).map((e) => e.turnIndex));
    for (const { i } of earlier) expect(cued.has(i)).toBe(false);
    const later = route.turns.map((t, i) => ({ t, i })).filter(({ t }) => t.atM > joinAt + 150);
    for (const { i } of later) expect(cued.has(i)).toBe(true);
    expect(r.state.status).toBe('finished');
  });

  it('GPS gap that jumps past a turn: that turn is skipped, not replayed', () => {
    const k = route.turns.findIndex((t) => t.atM > 1000);
    const turnAt = route.turns[k].atM;
    const before = walk(route, { fromM: 0, toM: turnAt - 200 });
    const r = replay(route, before);
    expect(turnEvents(r.events).some((e) => e.turnIndex === k)).toBe(false);

    // 100 s without fixes, then pick up 100 m past the turn.
    const after = walk(route, { fromM: turnAt + 100, toM: turnAt + 400, startAt: lastAt(before) + 100_000 });
    const r2 = replay(route, after, r.state);
    expect(r2.state.progressM).toBeGreaterThan(turnAt + 90);
    expect(turnEvents(r2.events).some((e) => e.turnIndex === k)).toBe(false);
    expect(r2.events.some((e) => e.kind === 'turn-skipped' && e.turnIndex === k)).toBe(true);
  });

  it('forward jumps are bounded: a fix far ahead right after a fix here is not accepted', () => {
    const fixes = walk(route, { fromM: 0, toM: 500 });
    const r = replay(route, fixes);
    const farAhead = { ...pointAt(route, 3500), accuracyM: 8, at: lastAt(fixes) + 1000 };
    const r2 = replay(route, [farAhead], r.state);
    expect(r2.state.progressM).toBeLessThan(600);
  });

  it('start/finish ambiguity: starting at the finish point of the loop begins at 0 km, not finished', () => {
    const end = route.points[route.points.length - 1];
    expect(approachInfo(route, end).atStart).toBe(true);
    const started = begin(route, createNav(route), { ...end, accuracyM: 8, at: 0 }, 0);
    expect(started.state.progressM).toBeLessThan(100);
    expect(started.state.status).toBe('following');

    // Milling about between start and finish before setting off does not finish.
    const mill = line(end, route.points[0], { startAt: 1000, steps: 30 });
    const r = replay(route, mill, started.state);
    expect(r.state.status).toBe('following');
    expect(kinds(r.events)).not.toContain('finished');
  });

  it('finish needs 90 % covered: reaching the finish area early does not finish', () => {
    const fixes = walk(route, { fromM: 0, toM: route.lengthM * (FINISH_FRACTION - 0.05) });
    const r = replay(route, fixes);
    expect(r.state.status).toBe('following');
    // Teleport to the finish point: too far ahead to accept, so still following.
    const end = route.points[route.points.length - 1];
    const r2 = replay(route, [{ ...end, accuracyM: 8, at: lastAt(fixes) + 1000 }], r.state);
    expect(r2.state.status).toBe('following');
  });

  it('"Start anyway" before GPS: waits, then joins when on the route', () => {
    const started = begin(route, createNav(route), null, 0);
    expect(started.state.anchored).toBe(false);
    const faraway = offsetPoint(route.points[0], 0, 1200);
    const r = replay(route, [{ ...faraway, accuracyM: 8, at: 1000 }], started.state);
    expect(r.state.anchored).toBe(false);
    expect(describeBanner(route, r.state).primary).toMatch(/^Head to the route/);
    const onRoute = walk(route, { fromM: 50, toM: 300, startAt: 2000 });
    const r2 = replay(route, onRoute, r.state);
    expect(r2.state.anchored).toBe(true);
    expect(r2.state.progressM).toBeGreaterThan(250);
  });

  it('ignores very inaccurate fixes for progress', () => {
    const fixes = walk(route, { fromM: 0, toM: 400 });
    const r = replay(route, fixes);
    const bad = { ...pointAt(route, 520), accuracyM: 150, at: lastAt(fixes) + 1000 };
    const r2 = update(route, r.state, bad);
    expect(r2.state.progressM).toBe(r.state.progressM);
    expect(r2.state.lastFix).toBe(bad);
  });

  it('approach: "at the start" within the generous radius only', () => {
    const start = route.points[0];
    expect(approachInfo(route, offsetPoint(start, 90, START_RADIUS_M - 20)).atStart).toBe(true);
    const far = approachInfo(route, offsetPoint(start, 90, START_RADIUS_M + 50));
    expect(far.atStart).toBe(false);
    // The start is to the west of a point east of it.
    expect(far.bearingDeg).toBeGreaterThan(260);
    expect(far.bearingDeg).toBeLessThan(280);
  });
});

describe('overlapping legs (out-and-back on one street)', () => {
  // 600 m east, then straight back on the same line.
  const origin = { lat: 45.5, lon: -73.6 };
  const east = offsetPoint(origin, 90, 600);
  const coords: [number, number][] = [
    [origin.lon, origin.lat],
    [east.lon, east.lat],
    [origin.lon + 0.00001, origin.lat],
  ];
  const route = prepareRoute(coords, [{ atM: 600, dir: 'u-turn', street: '' }]);

  it('stays on the outbound leg while going out, then follows the return', () => {
    const out = walk(route, { fromM: 0, toM: 590, jitterM: 4, seed: 9 });
    const r = replay(route, out);
    expect(r.state.progressM).toBeLessThan(620);
    expect(r.state.progressM).toBeGreaterThan(560);
    const back = walk(route, { fromM: 610, toM: route.lengthM, startAt: lastAt(out) + 1000, jitterM: 4, seed: 10 });
    const r2 = replay(route, back, r.state);
    expect(r2.state.status).toBe('finished');
    expect(turnEvents([...r.events, ...r2.events]).filter((e) => e.stage === 'now')).toHaveLength(1);
  });
});

describe('every route in the library', () => {
  const routes = allRoutes();

  it('includes the sample loop and Pi Day', () => {
    expect(routes.map((r) => r.data.id).sort()).toEqual(expect.arrayContaining(['pi-day', 'sample-loop']));
  });

  for (const { data, route } of routes) {
    it(`${data.id}: a jittery run cues every turn once and finishes`, () => {
      expect(Math.abs(route.lengthM - data.stats.distanceM)).toBeLessThan(5);
      const r = replay(route, walk(route, { fromM: 0, toM: route.lengthM, jitterM: 6, seed: 11 }));
      expect(isMonotonic(r.progress)).toBe(true);
      expect(kinds(r.events)).not.toContain('off-route');
      const now = turnEvents(r.events).filter((e) => e.stage === 'now').map((e) => e.turnIndex);
      expect(now).toEqual(route.turns.map((_, i) => i));
      expect(r.state.status).toBe('finished');
    });

    it(`${data.id}: starting at the finish point (loops) begins near 0 km`, () => {
      const end = route.points[route.points.length - 1];
      if (!approachInfo(route, end).atStart) return;
      const started = begin(route, createNav(route), { ...end, accuracyM: 8, at: 0 }, 0);
      expect(started.state.progressM).toBeLessThan(150);
    });
  }
});
