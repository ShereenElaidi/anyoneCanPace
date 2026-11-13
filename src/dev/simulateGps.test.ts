import { describe, expect, it } from 'vitest';
import { distanceM, offsetPoint } from '../nav/geo';
import { nearestBetween, pointAt } from '../nav/route';
import { sampleRoute } from '../nav/testing/replay';
import { SIM_DETOUR_M, simPosition } from './simulateGps';

describe('GPS simulator (dev only)', () => {
  const route = sampleRoute();

  it('runs along the route from the start, and stops at the finish', () => {
    expect(distanceM(simPosition(route, null, 0, 0, 0), route.points[0])).toBeLessThan(1);
    expect(distanceM(simPosition(route, null, 0, 1500, 0), pointAt(route, 1500))).toBeLessThan(1);
    expect(distanceM(simPosition(route, null, 0, route.lengthM + 500, 0), pointAt(route, route.lengthM))).toBeLessThan(1);
  });

  it('starting away: walks straight to the start first', () => {
    const away = offsetPoint(route.points[0], 0, 300);
    expect(distanceM(simPosition(route, away, 300, 0, 0), away)).toBeLessThan(1);
    expect(distanceM(simPosition(route, away, 300, 150, 0), route.points[0])).toBeCloseTo(150, -1);
    expect(distanceM(simPosition(route, away, 300, 300 + 1000, 0), pointAt(route, 1000))).toBeLessThan(1);
  });

  it('"Go off route" puts the runner well clear of the off-route threshold', () => {
    const p = simPosition(route, null, 0, 1500, SIM_DETOUR_M);
    expect(nearestBetween(route, p, 1300, 1700)!.distM).toBeGreaterThan(60);
  });
});
