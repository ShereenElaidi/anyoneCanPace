/**
 * Pure text for the direction banner and stats line. Always text, so the
 * meaning never depends on the arrow icon or colour.
 */
import { HEADS_UP_M, TURN_NOW_M, TURN_PASSED_GRACE_M } from './constants';
import { bearingDeg, compassWord } from './geo';
import { nearestBetween, pointAt, type PreparedRoute } from './route';
import { POOR_ACCURACY_M } from './constants';
import { approachInfo, joinOptions, nearStart, type NavState } from './tracker';
import type { Turn, TurnDir } from './types';

export type BannerIcon = TurnDir | 'bearing' | 'finish' | 'gps';

export interface Banner {
  icon: BannerIcon;
  /** For the 'bearing' icon: degrees clockwise from north (the map is north-up). */
  rotateDeg?: number;
  primary: string;
  secondary?: string;
  tone: 'normal' | 'soon' | 'now' | 'warning' | 'done';
}

const VERB: Record<TurnDir, string> = {
  left: 'Left',
  right: 'Right',
  'slight-left': 'Bear left',
  'slight-right': 'Bear right',
  'sharp-left': 'Sharp left',
  'sharp-right': 'Sharp right',
  'u-turn': 'U-turn',
  straight: 'Straight on',
};

/** "150 m", "45 m", "1.2 km". */
export function formatDistance(m: number): string {
  const v = Math.max(0, m);
  if (v >= 995) return `${(v / 1000).toFixed(1)} km`;
  if (v >= 100) return `${Math.round(v / 10) * 10} m`;
  return `${Math.round(v / 5) * 5} m`;
}

/** "3.2 km" with one decimal, for the stats line. */
export function formatKm(m: number): string {
  return `${(Math.max(0, m) / 1000).toFixed(1)} km`;
}

export function turnPhrase(turn: Turn): string {
  const verb = VERB[turn.dir];
  return turn.street ? `${verb} on ${turn.street}` : verb;
}

export function statsLine(route: PreparedRoute, state: NavState): string {
  const done = Math.min(state.progressM, route.lengthM);
  return `${formatKm(done)} done · ${formatKm(route.lengthM - done)} to go`;
}

/** The next turn that hasn't been passed yet, if any. */
export function nextTurnIndex(route: PreparedRoute, progressM: number): number {
  return route.turns.findIndex((t) => t.atM >= progressM - TURN_PASSED_GRACE_M);
}

function currentStreet(route: PreparedRoute, progressM: number, startStreet: string | undefined): string {
  let street = startStreet ?? '';
  for (const t of route.turns) {
    if (t.atM < progressM - TURN_PASSED_GRACE_M) street = t.street || street;
    else break;
  }
  return street;
}

export function describe(route: PreparedRoute, state: NavState, startStreet?: string): Banner {
  const fix = state.lastFix;

  if (state.status === 'finished') {
    return { icon: 'finish', primary: `Finished! ${formatKm(route.lengthM)}`, secondary: 'Nice pacing.', tone: 'done' };
  }

  if (state.status === 'approach') {
    if (!fix) {
      return {
        icon: 'gps',
        primary: 'Finding your location…',
        secondary: 'Stand where the phone can see the sky.',
        tone: 'normal',
      };
    }
    const info = approachInfo(route, fix);
    if (info.atStart) {
      return {
        icon: 'finish',
        primary: 'You’re at the start',
        secondary: `Start is ${formatDistance(info.distanceM)} away. Tap Start route when the group is ready.`,
        tone: 'normal',
      };
    }
    return {
      icon: 'bearing',
      rotateDeg: info.bearingDeg,
      primary: `Head to the start: ${formatDistance(info.distanceM)}`,
      secondary: `The start is to the ${compassWord(info.bearingDeg)}. Or tap Start anyway.`,
      tone: 'normal',
    };
  }

  // Following.
  if (!state.anchored) {
    if (!fix) {
      return { icon: 'gps', primary: 'Finding your location…', secondary: 'Progress starts once GPS finds you.', tone: 'normal' };
    }
    // On the route but not sure which part: say so instead of guessing.
    const legs = fix.accuracyM <= POOR_ACCURACY_M ? joinOptions(route, fix) : [];
    if (legs.length) {
      if (nearStart(route, fix)) {
        const finishing = legs.every((l) => l.alongM >= 0.9 * route.lengthM);
        return {
          icon: 'gps',
          primary: finishing ? 'Near the finish stretch' : 'Near a later part of the route',
          secondary: 'Head to the start to begin, or tap Join below if you’re already partway round.',
          tone: 'normal',
        };
      }
      return {
        icon: 'gps',
        primary: 'Which part of the route?',
        secondary: 'Several parts of the route pass here. Keep moving along it, or tap where you are below.',
        tone: 'normal',
      };
    }
    const target = nearestBetween(route, fix, 0, route.lengthM);
    const p = target ? pointAt(route, target.alongM) : route.points[0];
    const b = bearingDeg(fix, p);
    return {
      icon: 'bearing',
      rotateDeg: b,
      primary: `Head to the route: ${formatDistance(target?.distM ?? 0)}`,
      secondary: `The route is to the ${compassWord(b)}.`,
      tone: 'normal',
    };
  }

  if (state.offRoute && fix) {
    const target = nearestBetween(route, fix, state.progressM, state.progressM + 1000);
    const p = target ? pointAt(route, target.alongM) : pointAt(route, state.progressM);
    const b = bearingDeg(fix, p);
    const dist = formatDistance(target?.distM ?? state.distanceFromRouteM ?? 0);
    if (state.rogue) {
      return {
        icon: 'bearing',
        rotateDeg: b,
        primary: 'Going rogue',
        secondary: `The route is ${dist} to the ${compassWord(b)}.`,
        tone: 'normal',
      };
    }
    return {
      icon: 'bearing',
      rotateDeg: b,
      primary: `Off route: ${dist}`,
      secondary: `Head ${compassWord(b)} to get back on the route.`,
      tone: 'warning',
    };
  }

  const street = currentStreet(route, state.progressM, startStreet);
  const i = nextTurnIndex(route, state.progressM);
  if (i === -1) {
    const left = route.lengthM - state.progressM;
    return {
      icon: 'straight',
      primary: `Finish in ${formatDistance(left)}`,
      secondary: street ? `Continue on ${street}.` : undefined,
      tone: left <= HEADS_UP_M ? 'soon' : 'normal',
    };
  }

  const turn = route.turns[i];
  const d = turn.atM - state.progressM;
  if (d <= TURN_NOW_M) {
    return {
      icon: turn.dir,
      primary: `${VERB[turn.dir]} now${turn.street ? ` on ${turn.street}` : ''}`,
      secondary: turn.note,
      tone: 'now',
    };
  }
  if (d <= HEADS_UP_M) {
    return {
      icon: turn.dir,
      primary: `${turnPhrase(turn)} in ${formatDistance(d)}`,
      secondary: turn.note,
      tone: 'soon',
    };
  }
  return {
    icon: 'straight',
    primary: street ? `Continue on ${street} for ${formatDistance(d)}` : `Continue for ${formatDistance(d)}`,
    secondary: `Then ${turnPhrase(turn).replace(/^./, (c) => c.toLowerCase())}.`,
    tone: 'normal',
  };
}
