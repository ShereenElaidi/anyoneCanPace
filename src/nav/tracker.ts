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
  JOIN_PENALTY_PER_M,
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
import { candidatesBetween, type PreparedRoute, type RouteMatch } from './route';

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
  lastFix: Fix | null;
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
  | { kind: 'turn'; stage: TurnStage; turnIndex: number; at: number }
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
  return { ...state, lastFix: fix };
}

/**
 * Starts following. Works with or without a fix ("Start anyway" before GPS
 * locks): progress is anchored on the first good fix that is on the route.
 */
export function begin(route: PreparedRoute, state: NavState, fix: Fix | null, now: number): NavResult {
  let next: NavState = {
    ...createNav(route),
    status: 'following',
    lastFix: fix ?? state.lastFix,
    lastOnRouteAt: now,
  };
  const events: NavEvent[] = [];
  const latest = fix ?? state.lastFix;
  if (latest && latest.accuracyM <= POOR_ACCURACY_M) {
    next = tryAnchor(route, next, latest, events);
  }
  events.unshift({ kind: 'started', anchored: next.anchored, progressM: next.progressM });
  return { state: next, events };
}

/** Feeds one GPS fix. */
export function update(route: PreparedRoute, state: NavState, fix: Fix): NavResult {
  if (state.status !== 'following') return { state: observe(state, fix), events: [] };
  // Measured against the last fix of any accuracy: a gap means no GPS at all.
  const gap = state.lastFix === null || fix.at - state.lastFix.at > GPS_GAP_MS;
  let next: NavState = { ...state, lastFix: fix };
  const events: NavEvent[] = [];
  // A poor fix only moves the GPS dot.
  if (fix.accuracyM > POOR_ACCURACY_M) return { state: next, events };

  if (!next.anchored) {
    next = tryAnchor(route, next, fix, events);
    if (next.anchored) next = checkFinish(route, next, fix, events);
    return { state: next, events };
  }

  const best = bestForward(route, next, fix);
  next.distanceFromRouteM = best ? best.distM : null;
  const limit = next.offRoute ? BACK_ON_ROUTE_M : OFF_ROUTE_M;

  if (best && best.distM <= limit) {
    next.lastOnRouteAt = fix.at;
    next.offRouteSince = null;
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
  }

  next = processCues(route, next, fix.at, events, gap);
  next = checkFinish(route, next, fix, events);
  return { state: next, events };
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
 * Joins the route. Near the start, only the early part of the route is
 * considered (a loop's finish is right next to its start). Elsewhere (a late
 * joiner) the whole route is, with earlier legs winning near-ties.
 */
function tryAnchor(route: PreparedRoute, state: NavState, fix: Fix, events: NavEvent[]): NavState {
  const nearStart = distanceM(fix, route.points[0]) <= START_RADIUS_M;
  const to = nearStart ? Math.min(EARLY_WINDOW_M, route.lengthM) : route.lengthM;
  let best: RouteMatch | null = null;
  let bestScore = Infinity;
  let nearest = Infinity;
  for (const c of candidatesBetween(route, fix, 0, to)) {
    nearest = Math.min(nearest, c.distM);
    if (c.distM > OFF_ROUTE_M) continue;
    const score = c.distM + JOIN_PENALTY_PER_M * c.alongM;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return { ...state, distanceFromRouteM: Number.isFinite(nearest) ? nearest : null };
  let next: NavState = {
    ...state,
    anchored: true,
    progressM: best.alongM,
    lastOnRouteAt: fix.at,
    distanceFromRouteM: best.distM,
  };
  events.push({ kind: 'joined', progressM: best.alongM, at: fix.at });
  // Turns already behind a late joiner are done, silently.
  next = processCues(route, next, fix.at, events, true);
  return next;
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
      events.push({ kind: 'turn', stage: 'now', turnIndex: i, at });
    } else if (d <= HEADS_UP_M && current === 0) {
      to = 1;
      events.push({ kind: 'turn', stage: 'heads-up', turnIndex: i, at });
    }
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
