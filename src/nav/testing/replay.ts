/**
 * Test helpers: synthetic GPS tracks along a route, replayed point by point
 * through the pure tracker. Only imported by tests.
 */
import { offsetPoint, type LatLon } from '../geo';
import { bearingAt, pointAt, type PreparedRoute } from '../route';
import { begin, createNav, update, type Fix, type NavEvent, type NavState } from '../tracker';
import trackJson from '../../data/routes/sample-loop.geojson?raw';
import routeJson from '../../data/routes/sample-loop.json';
import { prepareRoute } from '../route';
import type { RouteData, TrackFeature } from '../types';

export const sampleData = routeJson as unknown as RouteData;
export const sampleTrack = JSON.parse(trackJson) as TrackFeature;
export const sampleRoute = (): PreparedRoute => prepareRoute(sampleTrack.geometry.coordinates, sampleData.turns);

/** Small seeded PRNG so "random" jitter is repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WalkOptions {
  fromM: number;
  toM: number;
  /** Metres per second (default 3, a slow jog). */
  speedMps?: number;
  /** Time between fixes (default 1000 ms). */
  everyMs?: number;
  /** Time of the first fix. */
  startAt?: number;
  /** Random GPS error: standard deviation in metres. */
  jitterM?: number;
  /** Constant sideways offset (positive = right of travel), metres. */
  lateralM?: number;
  accuracyM?: number;
  seed?: number;
}

function jitter(p: LatLon, sd: number, rand: () => number): LatLon {
  if (sd <= 0) return p;
  // Box–Muller, capped at 2.5 standard deviations.
  const r = Math.min(2.5, Math.sqrt(-2 * Math.log(1 - rand())) ) * sd;
  return offsetPoint(p, rand() * 360, r);
}

/** Fixes moving along the route from fromM to toM. */
export function walk(route: PreparedRoute, o: WalkOptions): Fix[] {
  const speed = o.speedMps ?? 3;
  const every = o.everyMs ?? 1000;
  const rand = mulberry32(o.seed ?? 1);
  const fixes: Fix[] = [];
  const step = (speed * every) / 1000;
  let at = o.startAt ?? 0;
  for (let d = o.fromM; ; d += step) {
    const along = Math.min(d, o.toM);
    let p = pointAt(route, along);
    if (o.lateralM) p = offsetPoint(p, bearingAt(route, along) + 90, o.lateralM);
    p = jitter(p, o.jitterM ?? 0, rand);
    fixes.push({ ...p, accuracyM: o.accuracyM ?? 8, at });
    at += every;
    if (along >= o.toM) break;
  }
  return fixes;
}

/** Fixes in a straight line between two points (for detours and approaches). */
export function line(from: LatLon, to: LatLon, o: { startAt: number; steps: number; everyMs?: number; accuracyM?: number }): Fix[] {
  const every = o.everyMs ?? 1000;
  return Array.from({ length: o.steps + 1 }, (_, i) => {
    const t = i / o.steps;
    return {
      lat: from.lat + t * (to.lat - from.lat),
      lon: from.lon + t * (to.lon - from.lon),
      accuracyM: o.accuracyM ?? 8,
      at: o.startAt + i * every,
    };
  });
}

export interface Replay {
  state: NavState;
  events: NavEvent[];
  /** Progress after every fix. */
  progress: number[];
}

/** Begins at the first fix (unless a state is given) and feeds the rest. */
export function replay(route: PreparedRoute, fixes: Fix[], from?: NavState): Replay {
  const events: NavEvent[] = [];
  const progress: number[] = [];
  let state: NavState;
  let rest = fixes;
  if (from) {
    state = from;
  } else {
    const started = begin(route, createNav(route), fixes[0], fixes[0].at);
    state = started.state;
    events.push(...started.events);
    progress.push(state.progressM);
    rest = fixes.slice(1);
  }
  for (const fix of rest) {
    const r = update(route, state, fix);
    state = r.state;
    events.push(...r.events);
    progress.push(state.progressM);
  }
  return { state, events, progress };
}

export const lastAt = (fixes: Fix[]) => fixes[fixes.length - 1].at;
