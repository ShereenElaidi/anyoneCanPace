/**
 * Pure route-following state machine.
 *
 * Feed it GPS fixes; it returns the new state plus any events (turn cues,
 * off route, finished). No clocks, no DOM, no `navigator`: every fix carries
 * its own timestamp, so tests replay recorded tracks point by point.
 *
 * Progress along the route only ever moves forward. Each fix is matched only
 * against a window just behind and ahead of the current progress, never the
 * globally nearest point, because routes can overlap themselves (a loop's
 * start and finish are a few metres apart). The window grows while no
 * on-route fix arrives, so GPS gaps and detours allow bounded forward jumps.
 * Off route, you can also rejoin further along than the window reaches (a
 * shortcut, a skipped section): only ahead of progress, and only once your
 * direction of travel matches exactly one part of the route (or you choose
 * "Join at x km").
 */
import {
  ADVANCE_PENALTY_PER_M,
  BACK_ON_ROUTE_M,
  BACK_TOLERANCE_M,
  EARLY_WINDOW_M,
  FINISH_FRACTION,
  FINISH_RADIUS_M,
  FORWARD_BASE_M,
  GPS_GAP_MS,
  HEADS_UP_M,
  JOIN_BEARING_TOLERANCE_DEG,
  JOIN_LEG_GAP_M,
  JOIN_MOVE_M,
  JOIN_PENALTY_PER_M,
  JOIN_TRAIL_MS,
  LATE_TURN_MAX_M,
  MAX_SPEED_MPS,
  OFF_ROUTE_M,
  OFF_ROUTE_MS,
  POOR_ACCURACY_M,
  START_RADIUS_M,
  TURN_NOW_M,
  TURN_PASSED_GRACE_M,
} from './constants';
import { bearingDeg, distanceM, type LatLon } from './geo';
import { bearingAt, candidatesBetween, type PreparedRoute, type RouteMatch } from './route';

export interface Fix extends LatLon {
  /** Reported accuracy radius, metres. */
  accuracyM: number;
  /** Time of the fix, milliseconds. */
  at: number;
}

export type NavStatus = 'approach' | 'following' | 'finished';

/** Per-turn cue progress: 0 nothing yet, 1 heads-up given, 2 done (now given, or skipped). */
export type CueState = 0 | 1 | 2;

export interface NavState {
  status: NavStatus;
  /** Distance covered along the route. Never decreases. */
  progressM: number;
  /** True once a fix has been matched to the route since starting. */
  anchored: boolean;
  /** Latest raw fix of any accuracy: for showing where you are, not for progress. */
  lastFix: Fix | null;
  /** Time of the latest usable fix (accuracy ≤ POOR_ACCURACY_M). GPS gaps are measured from here. */
  lastGoodFixAt: number | null;
  /**
   * Recent usable fixes while not yet joined, or while off route and near the route further
   * along, to pick a route leg by direction of travel. Memory only.
   */
  joinTrail: Fix[];
  /** Time of the last fix that was on the route; the forward window grows from here. */
  lastOnRouteAt: number | null;
  /** Distance from the latest good fix to the route (within the search window). */
  distanceFromRouteM: number | null;
  offRouteSince: number | null;
  offRoute: boolean;
  /** The pacer chose to leave the route on purpose. Cleared when they're back on it. */
  rogue: boolean;
  cues: CueState[];
}

export type TurnStage = 'heads-up' | 'now';

export type NavEvent =
  | { kind: 'started'; anchored: boolean; progressM: number }
  | { kind: 'joined'; progressM: number; at: number }
  /** distanceM: how far ahead the turn was when cued (negative = just past it). */
  | { kind: 'turn'; stage: TurnStage; turnIndex: number; at: number; distanceM: number }
  | { kind: 'turn-skipped'; turnIndex: number }
  | { kind: 'off-route'; at: number }
  | { kind: 'back-on-route'; at: number }
  | { kind: 'finished'; at: number };

export interface NavResult {
  state: NavState;
  events: NavEvent[];
}

export function createNav(route: PreparedRoute): NavState {
  return {
    status: 'approach',
    progressM: 0,
    anchored: false,
    lastFix: null,
    lastGoodFixAt: null,
    joinTrail: [],
    lastOnRouteAt: null,
    distanceFromRouteM: null,
    offRouteSince: null,
    offRoute: false,
    rogue: false,
    cues: route.turns.map(() => 0),
  };
}

export interface ApproachInfo {
  distanceM: number;
  bearingDeg: number;
  atStart: boolean;
}

/** Where the start is, relative to a fix, before the route has begun. */
export function approachInfo(route: PreparedRoute, fix: LatLon): ApproachInfo {
  const start = route.points[0];
  const d = distanceM(fix, start);
  return { distanceM: d, bearingDeg: bearingDeg(fix, start), atStart: d <= START_RADIUS_M };
}

/** Records a fix before the route has started (for the "head to the start" banner). */
export function observe(state: NavState, fix: Fix): NavState {
  return { ...state, lastFix: fix, lastGoodFixAt: usable(fix) ? fix.at : state.lastGoodFixAt };
}

const usable = (fix: Fix) => fix.accuracyM <= POOR_ACCURACY_M;

/**
 * Starts following. Works with or without a fix ("Start anyway" before GPS
 * locks): progress is anchored on the first good fix that is on the route.
 */
export function begin(route: PreparedRoute, state: NavState, fix: Fix | null, now: number): NavResult {
  const latest = fix ?? state.lastFix;
  let next: NavState = {
    ...createNav(route),
    status: 'following',
    lastFix: latest,
    lastGoodFixAt: latest && usable(latest) ? latest.at : null,
    lastOnRouteAt: now,
  };
  const events: NavEvent[] = [];
  if (latest && usable(latest)) {
    next = tryAnchor(route, next, latest, events);
  }
  events.unshift({ kind: 'started', anchored: next.anchored, progressM: next.progressM });
  return { state: next, events };
}

/** Feeds one GPS fix. */
export function update(route: PreparedRoute, state: NavState, fix: Fix): NavResult {
  if (state.status !== 'following') return { state: observe(state, fix), events: [] };
  // A gap means no *usable* GPS for a while: a stretch of poor fixes counts too, so turns
  // passed during it are skipped silently instead of cued late.
  const gap = state.lastGoodFixAt === null || fix.at - state.lastGoodFixAt > GPS_GAP_MS;
  let next: NavState = { ...state, lastFix: fix };
  const events: NavEvent[] = [];
  // A poor fix only moves the raw position, never progress, cues or off-route state.
  if (!usable(fix)) return { state: next, events };
  next.lastGoodFixAt = fix.at;

  if (!next.anchored) {
    next = tryAnchor(route, next, fix, events);
    if (next.anchored) next = checkFinish(route, next, fix, events);
    return { state: next, events };
  }

  const best = bestForward(route, next, fix);
  next.distanceFromRouteM = best ? best.distM : null;
  const limit = next.offRoute ? BACK_ON_ROUTE_M : OFF_ROUTE_M;
  let rejoined = false;

  if (best && best.distM <= limit) {
    next.lastOnRouteAt = fix.at;
    next.offRouteSince = null;
    next.joinTrail = [];
    if (best.alongM > next.progressM) next.progressM = best.alongM;
    if (next.offRoute) {
      next.offRoute = false;
      next.rogue = false;
      events.push({ kind: 'back-on-route', at: fix.at });
    }
  } else if (best && best.distM <= OFF_ROUTE_M) {
    // Between the two thresholds while off route: not back yet, still off.
  } else {
    next.offRouteSince ??= fix.at;
    if (!next.offRoute && fix.at - next.offRouteSince >= OFF_ROUTE_MS) {
      next.offRoute = true;
      events.push({ kind: 'off-route', at: fix.at });
    }
    if (next.offRoute) {
      next = tryRejoinAhead(route, next, fix, events);
      rejoined = !next.offRoute;
    }
  }

  // Turns skipped by rejoining further along are passed silently, like after a gap.
  next = processCues(route, next, fix.at, events, gap || rejoined);
  next = checkFinish(route, next, fix, events);
  return { state: next, events };
}

/**
 * Should the duck look confused? Off route (going rogue included), or started
 * but not yet on the route because the last good fix is too far from it.
 * Before Start ("head to the start") the duck stays normal.
 */
export function duckLost(state: NavState): boolean {
  if (state.offRoute) return true;
  return (
    state.status === 'following' &&
    !state.anchored &&
    state.distanceFromRouteM !== null &&
    state.distanceFromRouteM > OFF_ROUTE_M
  );
}

export type GpsHealth = 'ok' | 'stale' | 'rough';

/**
 * Whether the directions can be trusted right now. `stale`: no usable fix for
 * over GPS_GAP_MS (phone was locked, tunnel, lost signal). `rough`: fixes are
 * arriving but are too inaccurate to move progress. Only while following.
 */
export function gpsHealth(state: NavState, now: number): GpsHealth {
  if (state.status !== 'following' || !state.lastFix) return 'ok';
  // Nothing at all lately beats "rough": the phone isn't hearing GPS.
  if (now - state.lastFix.at > GPS_GAP_MS) return 'stale';
  if (state.lastGoodFixAt === null || now - state.lastGoodFixAt > GPS_GAP_MS) return 'rough';
  return 'ok';
}

/**
 * While off route: the places further along the route near the latest fix, for
 * "Join at x km". Never behind current progress (progress only moves forward).
 */
export function rejoinOptions(route: PreparedRoute, state: NavState): RouteMatch[] {
  const fix = state.lastFix;
  if (state.status !== 'following' || !state.anchored || !state.offRoute || !fix || !usable(fix)) return [];
  return joinOptions(route, fix).filter((l) => l.alongM > state.progressM + BACK_TOLERANCE_M);
}

/** The pacer said "yes, going rogue": stop nagging until they're back on the route. */
export function goRogue(state: NavState): NavState {
  return state.offRoute ? { ...state, rogue: true } : state;
}

// ---------------------------------------------------------------------------

function bestForward(route: PreparedRoute, state: NavState, fix: Fix): RouteMatch | null {
  const sinceOnRoute = state.lastOnRouteAt === null ? 0 : Math.max(0, fix.at - state.lastOnRouteAt) / 1000;
  const from = state.progressM - BACK_TOLERANCE_M;
  const to = state.progressM + FORWARD_BASE_M + MAX_SPEED_MPS * sinceOnRoute;
  let best: RouteMatch | null = null;
  let bestScore = Infinity;
  for (const c of candidatesBetween(route, fix, from, to)) {
    const score = c.distM + ADVANCE_PENALTY_PER_M * Math.max(0, c.alongM - state.progressM);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Places the route passes within OFF_ROUTE_M of a fix: one option per leg
 * (separate pass of the route), in route order. A loop's start and finish,
 * or the two directions of an out-and-back, are separate legs.
 */
export function joinOptions(route: PreparedRoute, fix: LatLon): RouteMatch[] {
  const legs: RouteMatch[] = [];
  let legEnd = -Infinity;
  for (const c of candidatesBetween(route, fix, 0, route.lengthM)) {
    if (c.distM > OFF_ROUTE_M) continue;
    const last = legs.at(-1);
    if (last && c.alongM - legEnd <= JOIN_LEG_GAP_M) {
      if (c.distM < last.distM) legs[legs.length - 1] = c;
    } else {
      legs.push(c);
    }
    legEnd = c.alongM;
  }
  return legs;
}

/** True when a fix is near the start, where the beginning of the route always wins. */
export const nearStart = (route: PreparedRoute, fix: LatLon) => distanceM(fix, route.points[0]) <= START_RADIUS_M;

/**
 * Joins the route, or waits when it can't tell where you are.
 *
 * - Near the start: the beginning of the route (first EARLY_WINDOW_M) wins. A
 *   later leg nearby (a loop's finish stretch) is never assumed; joining there
 *   needs an explicit choice (`joinAt`).
 * - Elsewhere, one leg nearby: join it (a late joiner).
 * - Elsewhere, several legs (overlaps, out-and-back): wait until reliable fixes
 *   show a direction of travel that matches exactly one leg, or an explicit choice.
 */
function tryAnchor(route: PreparedRoute, state: NavState, fix: Fix, events: NavEvent[]): NavState {
  const trail = [...state.joinTrail.filter((f) => fix.at - f.at <= JOIN_TRAIL_MS), fix].slice(-15);
  const legs = joinOptions(route, fix);
  if (!legs.length) {
    const nearest = candidatesBetween(route, fix, 0, route.lengthM).reduce((m, c) => Math.min(m, c.distM), Infinity);
    return { ...state, joinTrail: trail, distanceFromRouteM: Number.isFinite(nearest) ? nearest : null };
  }
  let pick: RouteMatch | null = null;
  if (nearStart(route, fix)) {
    const early = legs.filter((l) => l.alongM <= Math.min(EARLY_WINDOW_M, route.lengthM));
    pick = early.reduce<RouteMatch | null>(
      (best, l) => (!best || l.distM + JOIN_PENALTY_PER_M * l.alongM < best.distM + JOIN_PENALTY_PER_M * best.alongM ? l : best),
      null,
    );
  } else if (legs.length === 1) {
    pick = legs[0];
  } else {
    pick = legByMovement(route, legs, trail);
  }
  if (!pick) return { ...state, joinTrail: trail, distanceFromRouteM: Math.min(...legs.map((l) => l.distM)) };
  return anchorAt(route, state, fix, pick, events);
}

/** The one leg whose direction matches how you've been moving, if exactly one does. */
function legByMovement(route: PreparedRoute, legs: RouteMatch[], trail: Fix[]): RouteMatch | null {
  const from = trail[0];
  const to = trail[trail.length - 1];
  if (!from || from === to || distanceM(from, to) < JOIN_MOVE_M) return null;
  const heading = bearingDeg(from, to);
  const matching = legs.filter((l) => {
    const diff = Math.abs(((bearingAt(route, Math.min(l.alongM, route.lengthM - 1)) - heading + 540) % 360) - 180);
    return diff <= JOIN_BEARING_TOLERANCE_DEG;
  });
  return matching.length === 1 ? matching[0] : null;
}

function anchorAt(route: PreparedRoute, state: NavState, fix: Fix, at: RouteMatch, events: NavEvent[]): NavState {
  let next: NavState = {
    ...state,
    anchored: true,
    joinTrail: [],
    progressM: at.alongM,
    lastOnRouteAt: fix.at,
    distanceFromRouteM: at.distM,
  };
  events.push({ kind: 'joined', progressM: at.alongM, at: fix.at });
  // Turns already behind a late joiner are done, silently.
  next = processCues(route, next, fix.at, events, true);
  return next;
}

/**
 * Off route and back near the route further along than the forward window
 * reaches: rejoin there, but only when the recent fixes (all close to the
 * route) show a direction of travel that matches exactly one leg ahead. A
 * street crossing the route, or heading the wrong way along it, never rejoins.
 * The finish stretch is never assumed (on a loop it leads back to the start,
 * where someone may just be walking back): rejoining there needs "Join at".
 */
function tryRejoinAhead(route: PreparedRoute, state: NavState, fix: Fix, events: NavEvent[]): NavState {
  const close = rejoinOptions(route, { ...state, lastFix: fix }).filter(
    (l) => l.distM <= BACK_ON_ROUTE_M && l.alongM < FINISH_FRACTION * route.lengthM,
  );
  if (!close.length) return state.joinTrail.length ? { ...state, joinTrail: [] } : state;
  const trail = [...state.joinTrail.filter((f) => fix.at - f.at <= JOIN_TRAIL_MS), fix].slice(-15);
  const pick = legByMovement(route, close, trail);
  if (!pick) return { ...state, joinTrail: trail };
  return rejoinAt(state, fix, pick, events);
}

function rejoinAt(state: NavState, fix: Fix, at: RouteMatch, events: NavEvent[]): NavState {
  events.push({ kind: 'back-on-route', at: fix.at });
  return {
    ...state,
    joinTrail: [],
    progressM: Math.max(state.progressM, at.alongM),
    lastOnRouteAt: fix.at,
    distanceFromRouteM: at.distM,
    offRoute: false,
    offRouteSince: null,
    rogue: false,
  };
}

/**
 * The pacer chose where they are ("Join at 6.1 km"): when several legs are
 * plausible before joining, or further along the route while off route. Only
 * options near the latest usable fix are accepted, and never behind progress.
 */
export function joinAt(route: PreparedRoute, state: NavState, alongM: number): NavResult {
  const fix = state.lastFix;
  if (state.status !== 'following' || !fix || !usable(fix)) return { state, events: [] };
  const options = state.anchored ? rejoinOptions(route, state) : joinOptions(route, fix);
  const option = options.find((l) => Math.abs(l.alongM - alongM) < 1);
  if (!option) return { state, events: [] };
  const events: NavEvent[] = [];
  if (!state.anchored) return { state: anchorAt(route, state, fix, option, events), events };
  let next = rejoinAt(state, fix, option, events);
  next = processCues(route, next, fix.at, events, true);
  next = checkFinish(route, next, fix, events);
  return { state: next, events };
}

/**
 * Each turn cues at most once per stage. A turn jumped over during a GPS gap
 * (or by more than LATE_TURN_MAX_M) is skipped without a cue; one jumped over
 * between two close fixes still gets its "now" cue, late.
 */
function processCues(
  route: PreparedRoute,
  state: NavState,
  at: number,
  events: NavEvent[],
  afterGap: boolean,
): NavState {
  let cues: CueState[] | null = null;
  // A heads-up is only for the next manoeuvre: while an earlier turn is still to come, a
  // close later turn waits (it is announced with that turn's "now": "Left now, then right").
  let earlierPending = false;
  route.turns.forEach((turn, i) => {
    const current = (cues ?? state.cues)[i];
    if (current === 2) return;
    const d = turn.atM - state.progressM;
    let to: CueState = current;
    if (d < -TURN_PASSED_GRACE_M && (afterGap || d < -LATE_TURN_MAX_M)) {
      to = 2;
      events.push({ kind: 'turn-skipped', turnIndex: i });
    } else if (d <= TURN_NOW_M) {
      to = 2;
      events.push({ kind: 'turn', stage: 'now', turnIndex: i, at, distanceM: d });
    } else if (d <= HEADS_UP_M && current === 0 && !earlierPending) {
      to = 1;
      events.push({ kind: 'turn', stage: 'heads-up', turnIndex: i, at, distanceM: d });
    }
    if (to !== 2) earlierPending = true;
    if (to !== current) {
      cues ??= [...state.cues];
      cues[i] = to;
    }
  });
  return cues ? { ...state, cues } : state;
}

function checkFinish(route: PreparedRoute, state: NavState, fix: Fix, events: NavEvent[]): NavState {
  if (state.progressM < FINISH_FRACTION * route.lengthM) return state;
  const end = route.points[route.points.length - 1];
  const nearEnd = distanceM(fix, end) <= FINISH_RADIUS_M || state.progressM >= route.lengthM - FINISH_RADIUS_M;
  if (!nearEnd) return state;
  events.push({ kind: 'finished', at: fix.at });
  return { ...state, status: 'finished', offRoute: false, offRouteSince: null };
}
