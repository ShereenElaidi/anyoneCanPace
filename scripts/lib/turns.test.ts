import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { offsetPoint, type LatLon } from '../../src/nav/geo.ts';
import { cumulative, dedupe, parseGpx, removeSpurs, simplify } from './process-route.ts';
import { analyseTurns, proposeTurns, streetAlong, turnDir, turnReviewMarkdown, type Street } from './turns.ts';

const start: LatLon = { lat: 45.5, lon: -73.5 };

/** Points every `step` metres from `from` along `bearing` for `length` metres. */
function leg(from: LatLon, bearing: number, length: number, step = 10): LatLon[] {
  return Array.from({ length: Math.round(length / step) }, (_, i) => offsetPoint(from, bearing, (i + 1) * step));
}

/** A path from successive [bearing, length, step?] legs. */
function path(...legs: [number, number, number?][]): LatLon[] {
  const pts = [start];
  for (const [bearing, length, step] of legs) pts.push(...leg(pts[pts.length - 1], bearing, length, step));
  return pts;
}

const toCoords = (ps: LatLon[]) => ps.map((p) => [p.lon, p.lat] as [number, number]);
const analyse = (pts: LatLon[], streets: Street[] = []) => {
  const s = simplify(pts);
  return analyseTurns(s, cumulative(s), streets);
};
const dirs = (pts: LatLon[]) => analyse(pts).turns.map((t) => t.dir);

describe('turn directions', () => {
  it('names turn directions by angle', () => {
    expect(turnDir(-90)).toBe('left');
    expect(turnDir(90)).toBe('right');
    expect(turnDir(45)).toBe('slight-right');
    expect(turnDir(-140)).toBe('sharp-left');
    expect(turnDir(175)).toBe('u-turn');
  });
});

describe('turn suggestions', () => {
  it('a genuine 90° intersection is one turn, at the corner', () => {
    const turns = analyse(path([0, 300], [90, 300])).turns;
    expect(turns).toHaveLength(1);
    expect(turns[0].dir).toBe('right');
    expect(Math.abs(turns[0].atM - 300)).toBeLessThanOrEqual(5);
  });

  it('a sharp turn and a switchback', () => {
    expect(dirs(path([0, 300], [225, 300]))).toEqual(['sharp-left']);
    expect(dirs(path([0, 300], [90, 8], [180, 300]))).toEqual(['u-turn']);
  });

  it('gentle road curvature is not a turn', () => {
    // 60° over 300 m (radius ~290 m), then 90° over 500 m: bends, not turns.
    const pts: LatLon[] = [start];
    let bearing = 0;
    for (let i = 0; i < 30; i++) pts.push(offsetPoint(pts[pts.length - 1], (bearing += 2), 10));
    for (let i = 0; i < 50; i++) pts.push(offsetPoint(pts[pts.length - 1], (bearing += 1.8), 10));
    expect(dirs(pts)).toEqual([]);
  });

  it('a gentle curve followed by a real left turn', () => {
    const pts: LatLon[] = [start];
    let bearing = 0;
    for (let i = 0; i < 40; i++) pts.push(offsetPoint(pts[pts.length - 1], (bearing += 1), 10));
    pts.push(...leg(pts[pts.length - 1], bearing - 90, 300));
    const turns = analyse(pts).turns;
    expect(turns.map((t) => t.dir)).toEqual(['left']);
    expect(Math.abs(turns[0].atM - 400)).toBeLessThanOrEqual(20);
  });

  it('a rounded corner is one turn, not two', () => {
    const north = leg(start, 0, 300);
    const c2 = offsetPoint(north[north.length - 1], 45, 8);
    const pts = [start, ...north, c2, ...leg(c2, 90, 300)];
    const turns = proposeTurns(pts, cumulative(pts));
    expect(turns.map((t) => t.dir)).toEqual(['right']);
  });

  it('tiny zigzags (a crossing, a sidewalk change) are not turns, but are reported', () => {
    // A 4 m step disappears when the line is simplified to 5 m: nothing to report.
    expect(analyse(path([0, 200], [90, 4, 2], [0, 200])).review).toEqual([]);
    // A 14 m step across the street survives simplification and is rejected as a jog.
    const a = analyse(path([0, 200], [90, 14, 2], [0, 200]));
    expect(a.turns).toEqual([]);
    expect(a.review).toHaveLength(1);
    expect(a.review[0].decision).toBe('rejected');
    expect(a.review[0].reason).toMatch(/jog/);
    expect(a.review[0].components).toHaveLength(2);
    expect(a.review[0].needsReview).toBe(true); // further than the 5 m line tolerance
  });

  it('a tiny GPX spur is removed and leaves one turn at the corner', () => {
    const north = leg(start, 0, 200);
    const corner = north[north.length - 1];
    const spurOut = leg(corner, 270, 20, 5);
    const spurBack = [...spurOut].reverse().slice(1).concat([offsetPoint(corner, 0, 1)]);
    const pts = [start, ...north, ...spurOut, ...spurBack, ...leg(corner, 90, 200)];
    const cleaned = simplify(dedupe(removeSpurs(pts).points));
    expect(analyseTurns(cleaned, cumulative(cleaned)).turns.map((t) => t.dir)).toEqual(['right']);
  });

  it('a dogleg onto a parallel street (a block to the side) keeps both turns', () => {
    const a = analyse(path([0, 200], [90, 30], [0, 200]));
    expect(a.turns.map((t) => t.dir)).toEqual(['right', 'left']);
    expect(Math.abs(a.turns[1].atM - a.turns[0].atM - 30)).toBeLessThanOrEqual(3);
    expect(a.review.every((r) => r.needsReview)).toBe(true);
  });

  it('two legitimate turns 60 m apart are both kept and not flagged', () => {
    const pts = path([0, 200], [90, 60], [180, 200]);
    const streets = [
      { name: 'rue A', coords: toCoords(pts.slice(0, 21)) },
      { name: 'rue B', coords: toCoords(pts.slice(20, 27)) },
      { name: 'rue C', coords: toCoords(pts.slice(26)) },
    ];
    const a = analyse(pts, streets);
    expect(a.turns.map((t) => [t.dir, t.street])).toEqual([
      ['right', 'rue B'],
      ['right', 'rue C'],
    ]);
    expect(a.review.some((r) => r.needsReview)).toBe(false);
  });

  it('going round a short block (right, 30 m, right) keeps both turns, not one U-turn', () => {
    const a = analyse(path([0, 200], [90, 30], [180, 200]));
    expect(a.turns.map((t) => t.dir)).toEqual(['right', 'right']);
    expect(a.review[0].reason).toMatch(/short block/);
  });

  it('a loop whose end overlaps its start: one turn per corner, nothing extra at the ends', () => {
    // A 400 m square, then 30 m along the first side again to the finish.
    const a = analyse(path([0, 400], [90, 400], [180, 400], [270, 400], [0, 30]));
    expect(a.turns.map((t) => t.dir)).toEqual(['right', 'right', 'right', 'right']);
    expect(a.turns.map((t) => Math.round(t.atM / 100) * 100)).toEqual([400, 800, 1200, 1600]);
  });

  it('a turn right after the start is folded into the start instruction', () => {
    const north = leg(start, 0, 15);
    const corner = north[north.length - 1];
    const east = leg(corner, 90, 300);
    const streets = [{ name: 'rue Rachel', coords: toCoords([corner, east[east.length - 1]]) }];
    const a = analyse([start, ...north, ...east], streets);
    expect(a.turns).toEqual([]);
    expect(a.startStreet).toBe('rue Rachel');
    expect(a.review[0]).toMatchObject({ decision: 'rejected', needsReview: true });
  });

  it('the start street comes from the first leg only, not from after the first turn', () => {
    const north = leg(start, 0, 100);
    const corner = north[north.length - 1];
    const east = leg(corner, 90, 300);
    const streets = [
      { name: 'avenue du Parc', coords: toCoords([start, corner]) },
      { name: 'rue Rachel', coords: toCoords([corner, east[east.length - 1]]) },
    ];
    const a = analyse([start, ...north, ...east], streets);
    expect(a.startStreet).toBe('avenue du Parc');
    expect(a.turns).toMatchObject([{ dir: 'right', street: 'rue Rachel' }]);
    // With no named street on the first leg the start street stays empty: no guessing.
    const b = analyse([start, ...north, ...east], streets.slice(1));
    expect(b.startStreet).toBe('');
    expect(b.startNote).toMatch(/check where the route starts/);
  });

  it('a turn that stays on the same street is kept, and flagged', () => {
    // One street with an L-shaped bend.
    const north = leg(start, 0, 300);
    const corner = north[north.length - 1];
    const east = leg(corner, 90, 300);
    const streets = [{ name: 'rue de la Commune', coords: toCoords([start, corner, east[east.length - 1]]) }];
    const a = analyse([start, ...north, ...east], streets);
    expect(a.turns).toMatchObject([{ dir: 'right', street: 'rue de la Commune' }]);
    expect(a.review[0].needsReview).toBe(true);
    expect(a.review[0].reason).toMatch(/same street/);
  });

  it('a street-name change alone is not a turn', () => {
    const pts = path([0, 600]);
    const streets = [
      { name: 'rue Sainte-Catherine Ouest', coords: toCoords([start, pts[30]]) },
      { name: 'rue Sainte-Catherine Est', coords: toCoords([pts[30], pts[pts.length - 1]]) },
    ];
    const a = analyse(pts, streets);
    expect(a.turns).toEqual([]);
    expect(a.review).toEqual([]);
  });
});

describe('street names', () => {
  const north = leg(start, 0, 300);
  const corner = north[north.length - 1];
  const east = leg(corner, 90, 300);
  const pts = [start, ...north, ...east];
  const cum = cumulative(pts);

  it('fills names from streets that run the same way as the route', () => {
    const streets = [
      { name: 'avenue du Parc', coords: toCoords([start, corner]) },
      { name: 'rue Rachel', coords: toCoords([corner, east[east.length - 1]]) },
    ];
    expect(streetAlong(pts, cum, streets, 0, 60)).toBe('avenue du Parc');
    expect(streetAlong(pts, cum, streets, 310, 360)).toBe('rue Rachel');
    expect(streetAlong(pts, cum, [], 310, 360)).toBe('');
  });

  it('a cross street right next to the route does not win', () => {
    // A side street crossing the route at 150 m, perpendicular: nearer at the crossing, but wrong.
    const mid = north[14];
    const cross = { name: 'rue Clark', coords: toCoords([offsetPoint(mid, 90, 40), offsetPoint(mid, 270, 40)]) };
    const parc = { name: 'avenue du Parc', coords: toCoords([offsetPoint(start, 90, 12), offsetPoint(corner, 90, 12)]) };
    expect(streetAlong(pts, cum, [cross, parc], 140, 160)).toBe('avenue du Parc');
    expect(streetAlong(pts, cum, [cross], 140, 160)).toBe('');
  });
});

describe('Sample Loop regression', () => {
  const gpx = parseGpx(readFileSync(resolve(process.cwd(), 'routes/onthegomap-6.4-km-route.gpx'), 'utf8'));
  const track = simplify(dedupe(removeSpurs(dedupe(gpx.points)).points));
  const cum = cumulative(track);
  const { streets } = JSON.parse(readFileSync(resolve(process.cwd(), 'routes/cache/sample-loop.streets.json'), 'utf8')) as {
    streets: Street[];
  };
  const a = analyseTurns(track, cum, streets);
  const near = (km: number) => a.review.filter((r) => Math.abs(r.atM - km * 1000) <= 60);

  it('the suggested turns', () => {
    expect(a.turns.map((t) => [Math.round(t.atM / 10) * 10, t.dir, t.street])).toEqual([
      [50, 'left', 'Rue Sainte-Catherine Ouest'],
      [140, 'right', 'Boulevard Saint-Laurent'],
      [1120, 'right', 'Rue de la Commune Ouest'],
      [2150, 'left', 'Rue de la Commune Ouest'],
      [2230, 'slight-right', 'Rue de la Commune Ouest'],
      [2520, 'right', 'Rue de la Commune Ouest'],
      [4620, 'right', 'Rue Sherbrooke Ouest'],
      [5900, 'sharp-right', 'Rue Clark'],
    ]);
  });

  it('the start is not "Sainte-Catherine, then left on Sainte-Catherine"', () => {
    // The first 46 m are on a way with no street name; the start street stays unknown.
    expect(a.startStreet).toBe('');
    expect(a.turns[0].street).toBe('Rue Sainte-Catherine Ouest');
    // The 8 m jog at 76–84 m belongs to the same left turn, not a separate instruction.
    expect(near(0.06)[0]).toMatchObject({ decision: 'consolidated', dir: 'left' });
    expect(near(0.06)[0].components.length).toBe(3);
  });

  it('the Commune / Mill junction is one dogleg (two instructions), not four turns', () => {
    const junction = a.review.filter((r) => r.atM > 2100 && r.atM < 2300);
    expect(junction.map((r) => r.dir)).toEqual(['left', 'slight-right']);
    expect(junction.every((r) => r.needsReview && /dogleg/.test(r.reason))).toBe(true);
    // The 4 heading changes are all accounted for.
    expect(junction.flatMap((r) => r.components)).toHaveLength(4);
  });

  it('the jog at 1.47 km is rejected but reported', () => {
    expect(near(1.46)[0]).toMatchObject({ decision: 'rejected', needsReview: true });
  });

  it('the review report lists every candidate', () => {
    const md = turnReviewMarkdown(a);
    expect(md).toMatch(/^Start street: \*unknown\*/);
    expect(md.match(/^\| \d/gm)).toHaveLength(a.review.length);
    expect(md).toMatch(/~~Bear left~~/); // the rejected jog, struck through
  });
});
