import { describe, expect, it } from 'vitest';
import { boundsCentredOn, FOLLOW_MAX_ZOOM, OFF_ROUTE_MIN_ZOOM, offRouteZoom } from './camera';

describe('off-route camera', () => {
  it('centres the bounds on the duck and still reaches the route point', () => {
    const duck = { lon: -73.56, lat: 45.5 };
    const back = { lon: -73.55, lat: 45.52 };
    const [[w, s], [e, n]] = boundsCentredOn(duck, back);
    expect((w + e) / 2).toBeCloseTo(duck.lon, 10);
    expect((s + n) / 2).toBeCloseTo(duck.lat, 10);
    expect(e).toBeGreaterThanOrEqual(back.lon);
    expect(n).toBeGreaterThanOrEqual(back.lat);
  });

  it('works whichever side the route point is on', () => {
    const [[w, s], [e, n]] = boundsCentredOn({ lon: 0, lat: 0 }, { lon: 0.01, lat: -0.02 });
    expect([w, s, e, n]).toEqual([-0.01, -0.02, 0.01, 0.02]);
  });

  it('never zooms out past the cap, or in past the follow zoom', () => {
    expect(offRouteZoom(11)).toBe(OFF_ROUTE_MIN_ZOOM);
    expect(offRouteZoom(15.2)).toBe(15.2);
    expect(offRouteZoom(19)).toBe(FOLLOW_MAX_ZOOM);
    expect(offRouteZoom(undefined)).toBe(OFF_ROUTE_MIN_ZOOM);
  });
});
