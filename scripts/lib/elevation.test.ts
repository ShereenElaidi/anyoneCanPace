import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cellNodes,
  COPERNICUS_GLO90,
  gainLoss,
  NRCAN_CDEM,
  processElevation,
  type ElevationSample,
  type ElevationSource,
} from './elevation.ts';

const cache = (name: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), `routes/cache/${name}`), 'utf8')) as {
    coords: [number, number][];
    elevations: (number | null)[];
  };

/** Samples every `step` metres from a function of distance. */
const along = (lengthM: number, step: number, f: (d: number) => number | null): ElevationSample[] =>
  Array.from({ length: Math.floor(lengthM / step) + 1 }, (_, i) => ({ d: i * step, ele: f(i * step) }));

/** A deterministic pseudo-random sequence in [-1, 1]. */
const noise = (i: number) => Math.sin(i * 12.9898) * 43758.5453 % 1;

/** What a nearest-cell DEM returns: the value at the centre of the cell the sample falls in, rounded. */
const nearestCell = (f: (d: number) => number, cellM: number) => (d: number) =>
  Math.round(f((Math.floor(d / cellM) + 0.5) * cellM));

const SOURCE: ElevationSource = { name: 'test', resolutionM: 25, relativeErrorM: 2, quantumM: 1, sampleStepM: 10 };

describe('climb and descent (hysteresis)', () => {
  it('counts a whole climb, not threshold-sized steps', () => {
    const hill = [...Array.from({ length: 21 }, (_, i) => 20 + i), ...Array.from({ length: 21 }, (_, i) => 40 - i)];
    expect(gainLoss(hill, 3)).toEqual({ gainM: 20, lossM: 20 });
  });

  it('ignores back-and-forth smaller than the threshold', () => {
    const wiggle = Array.from({ length: 100 }, (_, i) => 50 + (i % 2 ? 1.2 : -1.2));
    expect(gainLoss(wiggle, 3)).toEqual({ gainM: 0, lossM: 0 });
  });

  it('a small dip at the top of a climb does not split it', () => {
    expect(gainLoss([10, 20, 30, 29, 40, 10], 3)).toEqual({ gainM: 30, lossM: 30 });
  });
});

describe('elevation processing', () => {
  it('flat terrain with small noise has no climb', () => {
    const flat = along(2000, 10, (d) => Math.round(30 + 1.4 * noise(d)));
    const r = processElevation(flat, SOURCE);
    expect(r.summary?.gainM).toBe(0);
    expect(r.summary?.lossM).toBe(0);
    expect(r.summary!.maxEleM - r.summary!.minEleM).toBeLessThanOrEqual(2);
  });

  it('keeps a genuine sustained climb and descent', () => {
    // 1 km at +4 %, 1 km at -4 %: 40 m up, 40 m down.
    const hill = along(2000, 10, (d) => Math.round(20 + 0.04 * (d <= 1000 ? d : 2000 - d)));
    const r = processElevation(hill, SOURCE);
    expect(r.summary!.gainM).toBeGreaterThanOrEqual(38);
    expect(r.summary!.gainM).toBeLessThanOrEqual(40);
    expect(r.summary!.lossM).toBeGreaterThanOrEqual(38);
    expect(r.summary!.maxEleM).toBeGreaterThanOrEqual(59);
    expect(r.spikes).toHaveLength(0);
  });

  it('removes an isolated spike (a roof) and an isolated pit (water)', () => {
    // Copernicus-like: 25 m samples, one 90 m cell is a building, another a pond.
    const s = along(2000, 25, (d) => (d >= 500 && d < 590 ? 80 : d >= 1400 && d < 1490 ? 2 : 30));
    const r = processElevation(s, COPERNICUS_GLO90);
    expect(r.spikes.map((p) => p.raw)).toEqual([80, 2]);
    expect(r.summary).toMatchObject({ gainM: 0, lossM: 0, minEleM: 30, maxEleM: 30 });
    // Raw samples, without the processing, would count both.
    expect(r.rawGainM).toBeGreaterThan(70);
  });

  it('repeated samples from a coarse grid: one node per cell and a smooth climb', () => {
    // A steady 3 % climb seen through a 90 m nearest-cell grid, sampled every 25 m: stairs.
    const f = (d: number) => 10 + 0.03 * d;
    const s = along(1800, 25, nearestCell(f, 90));
    const nodes = cellNodes(s, 90);
    expect(nodes.length).toBeLessThan(s.length / 2);
    expect(nodes.length).toBeGreaterThanOrEqual(18);
    const r = processElevation(s, COPERNICUS_GLO90);
    // True climb 54 m (minus half a cell at each end the grid can't see).
    expect(r.summary!.gainM).toBeGreaterThanOrEqual(48);
    expect(r.summary!.gainM).toBeLessThanOrEqual(54);
    expect(r.summary!.lossM).toBe(0);
    // No stairs left: the profile climbs at every step away from the ends.
    const mid = r.stages.slice(8, -8).map((x) => x.final);
    for (let i = 1; i < mid.length; i++) expect(mid[i]).toBeGreaterThan(mid[i - 1]);
  });

  it('cells alternating on either side of the street add nothing', () => {
    // 3 m up and down every other 50 m cell: shorter than the grid can represent.
    const s = along(3000, 25, (d) => (Math.floor(d / 50) % 2 ? 17 : 14));
    expect(processElevation(s, COPERNICUS_GLO90).summary?.gainM).toBe(0);
  });

  it('bridges missing values and says how much was missing', () => {
    const f = (d: number) => 20 + 0.02 * d;
    const s = along(2000, 10, (d) => (d > 800 && d < 1000 ? null : Math.round(f(d))));
    const r = processElevation(s, SOURCE);
    expect(r.missingM).toBe(200);
    expect(r.summary!.gainM).toBeGreaterThanOrEqual(38);
    expect(r.summary!.gainM).toBeLessThanOrEqual(40);
    expect(r.stages.find((x) => x.d === 900)?.raw).toBeNull();
    expect(r.stages.find((x) => x.d === 900)?.final).toBeCloseTo(38, 0);
  });

  it('no elevation at all is unknown, not zero', () => {
    expect(processElevation(along(1000, 10, () => null), SOURCE).summary).toBeNull();
    expect(processElevation([{ d: 0, ele: 30 }], SOURCE).summary).toBeNull();
    expect(processElevation([], SOURCE).summary).toBeNull();
  });

  it('profile is every 50 m and ends at the end of the route', () => {
    const r = processElevation(along(1005, 10, () => 30), SOURCE);
    expect(r.summary!.profile[0]).toEqual([0, 30]);
    expect(r.summary!.profile[1][0]).toBe(50);
    expect(r.summary!.profile.at(-1)?.[0]).toBe(1000);
  });
});

describe('Sample Loop regression', () => {
  it('bare-earth CDEM: about 40 m of climb between about 10 and 49 m', () => {
    const { elevations } = cache('sample-loop.elevation.json');
    const r = processElevation(elevations.map((ele, i) => ({ d: i * NRCAN_CDEM.sampleStepM, ele })), NRCAN_CDEM);
    expect(r.missingM).toBe(0);
    expect(r.summary!.gainM).toBeGreaterThanOrEqual(36);
    expect(r.summary!.gainM).toBeLessThanOrEqual(45);
    expect(Math.abs(r.summary!.gainM - r.summary!.lossM)).toBeLessThanOrEqual(2); // a loop
    expect(r.summary!.minEleM).toBeGreaterThanOrEqual(8);
    expect(r.summary!.maxEleM).toBeLessThanOrEqual(52);
  });

  it('the old surface-model samples stay far above bare earth: processing cannot remove roofs', () => {
    const { elevations } = cache('sample-loop.elevation-copernicus.json');
    const r = processElevation(elevations.map((ele, i) => ({ d: i * 25, ele })), COPERNICUS_GLO90);
    expect(r.spikes.length).toBeGreaterThanOrEqual(1); // the 2 m sample at 3.2 km
    expect(r.summary!.gainM).toBeLessThan(r.rawGainM);
    expect(r.summary!.gainM).toBeGreaterThan(100);
  });
});
