import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { distanceM, offsetPoint, type LatLon } from '../../src/nav/geo.ts';
import { classify, cumulative, dedupe, outlinePath, parseGpx, removeSpurs, simplify } from './process-route.ts';
import { proposeTurns } from './turns.ts';

const SAMPLE = readFileSync(resolve(process.cwd(), 'routes/onthegomap-6.4-km-route.gpx'), 'utf8');
const total = (pts: LatLon[]) => cumulative(pts).at(-1) as number;

/** Points every `step` metres from `from` along `bearing` for `length` metres. */
function leg(from: LatLon, bearing: number, length: number, step = 10): LatLon[] {
  return Array.from({ length: Math.floor(length / step) }, (_, i) => offsetPoint(from, bearing, (i + 1) * step));
}

describe('GPX parsing', () => {
  it('reads the sample route: 345 points, about 6.43 km, no elevation', () => {
    const gpx = parseGpx(SAMPLE);
    expect(gpx.name).toBe('6.4km route');
    expect(gpx.points).toHaveLength(345);
    expect(gpx.points.every((p) => p.ele === undefined)).toBe(true);
    expect(total(gpx.points)).toBeGreaterThan(6400);
    expect(total(gpx.points)).toBeLessThan(6460);
  });

  it('reads elevation and route points too', () => {
    const gpx = parseGpx(
      `<gpx><rte><rtept lon="-73.5" lat="45.5"><ele>30.5</ele></rtept><rtept lat='45.501' lon='-73.5'/></rte></gpx>`,
    );
    expect(gpx.points).toEqual([
      { lat: 45.5, lon: -73.5, ele: 30.5 },
      { lat: 45.501, lon: -73.5 },
    ]);
  });
});

describe('cleaning', () => {
  it('removes near-duplicate points', () => {
    const a = { lat: 45.5, lon: -73.5 };
    const b = offsetPoint(a, 90, 1);
    const c = offsetPoint(a, 90, 50);
    expect(dedupe([a, b, c])).toEqual([a, c]);
  });

  it('removes a short dead-end spur but keeps the corner', () => {
    const start = { lat: 45.5, lon: -73.5 };
    const north = leg(start, 0, 200);
    const corner = north[north.length - 1];
    const spurOut = leg(corner, 270, 20, 5); // 20 m west and…
    const spurBack = [...spurOut].reverse().slice(1).concat([offsetPoint(corner, 0, 1)]); // …back
    const east = leg(corner, 90, 200);
    const pts = [start, ...north, ...spurOut, ...spurBack, ...east];
    const { points, removed } = removeSpurs(pts);
    expect(removed).toHaveLength(1);
    expect(removed[0].pathM).toBeGreaterThan(35);
    expect(total(points)).toBeCloseTo(400, -1);
    // Without the spur, the only turn is the right turn at the corner.
    const simple = simplify(points);
    const turns = proposeTurns(simple, cumulative(simple));
    expect(turns.map((t) => t.dir)).toEqual(['right']);
  });

  it('finds the routing-tool spurs in the sample', () => {
    const { removed } = removeSpurs(dedupe(parseGpx(SAMPLE).points));
    expect(removed.length).toBeGreaterThanOrEqual(3);
    expect(removed.length).toBeLessThanOrEqual(5);
    for (const s of removed) expect(s.pathM).toBeLessThan(30);
  });

  it('a long out-and-back turnaround is not a spur', () => {
    const start = { lat: 45.5, lon: -73.5 };
    const out = leg(start, 0, 500);
    const back = [...out].reverse().slice(1).concat([start]);
    expect(removeSpurs([start, ...out, ...back]).removed).toHaveLength(0);
  });

  it('simplifies straight runs to their ends within ~5 m and keeps sharp corners', () => {
    const start = { lat: 45.5, lon: -73.5 };
    const north = leg(start, 0, 300);
    const corner = north[north.length - 1];
    const pts = [start, ...north, ...leg(corner, 90, 300)];
    const simple = simplify(pts);
    expect(simple).toHaveLength(3);
    expect(distanceM(simple[1], corner)).toBeLessThan(1);
  });
});

describe('measuring and classifying', () => {
  const start = { lat: 45.5, lon: -73.5 };
  it('loop, out-and-back, point-to-point', () => {
    const square = [start, offsetPoint(start, 0, 500)];
    square.push(offsetPoint(square[1], 90, 500));
    square.push(offsetPoint(square[2], 180, 500));
    square.push(offsetPoint(start, 90, 20));
    expect(classify(square, cumulative(square))).toBe('loop');

    const out = leg(start, 0, 1000, 50);
    const outBack = [start, ...out, ...[...out].reverse().slice(1), start];
    expect(classify(outBack, cumulative(outBack))).toBe('out-and-back');

    const p2p = [start, ...leg(start, 45, 2000, 100)];
    expect(classify(p2p, cumulative(p2p))).toBe('point-to-point');
  });

  it('the sample is a loop', () => {
    const pts = simplify(dedupe(removeSpurs(dedupe(parseGpx(SAMPLE).points)).points));
    expect(classify(pts, cumulative(pts))).toBe('loop');
  });

  it('outline path stays inside the 0..100 box', () => {
    const pts = parseGpx(SAMPLE).points;
    const path = outlinePath(pts);
    const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums)).toBeLessThanOrEqual(100);
    expect(path.startsWith('M')).toBe(true);
  });
});
