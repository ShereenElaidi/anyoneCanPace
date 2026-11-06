/**
 * Route editor: pure helpers for the turn editor. Where a click on the map
 * lands on the route, which build suggestions match the current turns, and a
 * first guess at a new turn's direction. No DOM or map code.
 */
import { headingChange, type LatLon } from '../../nav/geo';
import { bearingAt, candidatesBetween, type PreparedRoute } from '../../nav/route';
import type { Turn, TurnDir } from '../../nav/types';
import type { ReviewTurn } from './types';

/** A build suggestion counts as "this turn" within this distance along the route. */
export const MATCH_M = 25;
/** A map click further than this from the route doesn't add a turn. */
export const CLICK_M = 40;
/** Two places on the route closer than this along it are the same place (not two legs). */
const SAME_PLACE_M = 60;

export interface ClickOption {
  atM: number;
  /** Metres from the click to the route there. */
  offM: number;
}

/**
 * Where a click lands on the route. Routes overlap (out-and-back legs, a
 * loop's start and finish), so every leg within CLICK_M is returned, in order
 * along the route, and the editor asks which one is meant. Never just the
 * globally nearest point.
 */
export function clickOptions(route: PreparedRoute, p: LatLon): ClickOption[] {
  const near = candidatesBetween(route, p, 0, route.lengthM)
    .filter((c) => c.distM <= CLICK_M)
    .sort((a, b) => a.distM - b.distM);
  const kept: ClickOption[] = [];
  for (const c of near) {
    if (kept.some((k) => Math.abs(k.atM - c.alongM) < SAME_PLACE_M)) continue;
    kept.push({ atM: Math.round(c.alongM), offM: Math.round(c.distM) });
  }
  return kept.sort((a, b) => a.atM - b.atM);
}

/** Same thresholds as the build's turnDir (scripts/lib/turns.ts). */
export function dirFromAngle(angle: number): TurnDir {
  const a = Math.abs(angle);
  if (a < 20) return 'straight';
  const side = angle < 0 ? 'left' : 'right';
  if (a >= 160) return 'u-turn';
  if (a >= 125) return `sharp-${side}`;
  if (a >= 60) return side;
  return `slight-${side}`;
}

/** A first guess for a turn added by hand: the change of heading 20 m either side. */
export function guessDir(route: PreparedRoute, atM: number): TurnDir {
  const before = bearingAt(route, Math.max(0, atM - 20));
  const after = bearingAt(route, Math.min(route.lengthM, atM + 20));
  return dirFromAngle(headingChange(before, after));
}

/** Adds a turn in order along the route. Refuses a second turn within 5 m of another. */
export function insertTurn(turns: Turn[], turn: Turn): { turns: Turn[] } | { error: string } {
  const clash = turns.find((t) => Math.abs(t.atM - turn.atM) < 5);
  if (clash) return { error: `There is already a turn at ${(clash.atM / 1000).toFixed(2)} km.` };
  return { turns: [...turns, turn].sort((a, b) => a.atM - b.atM) };
}

export interface TurnNote {
  /** The build flagged the candidate at this place for a person to check. */
  needsReview: boolean;
  /** Why, in the build's words. */
  reason: string;
  /** What the build would call it. */
  suggested?: string;
}

const candidateName = (c: ReviewTurn) =>
  `${c.dir}${c.streetAfter ? ` onto ${c.streetAfter}` : ''}`;

/** The build's note for each current turn (by index), from the closest kept candidate within MATCH_M. */
export function notesForTurns(turns: Turn[], candidates: ReviewTurn[] = []): (TurnNote | null)[] {
  const kept = candidates.filter((c) => c.decision !== 'rejected');
  return turns.map((t) => {
    const near = kept
      .filter((c) => Math.abs(c.atM - t.atM) <= MATCH_M)
      .sort((a, b) => Math.abs(a.atM - t.atM) - Math.abs(b.atM - t.atM))[0];
    if (!near) return null;
    const differs = near.dir !== t.dir || (near.streetAfter ?? '') !== t.street;
    return { needsReview: near.needsReview, reason: near.reason, ...(differs ? { suggested: candidateName(near) } : {}) };
  });
}

/**
 * Build suggestions with no turn near them that a person should look at:
 * kept ones (the build proposed a turn that's no longer in the list) and
 * rejected ones flagged for review (the build dropped it but wasn't sure).
 */
export function openSuggestions(turns: Turn[], candidates: ReviewTurn[] = []): ReviewTurn[] {
  return candidates.filter(
    (c) => (c.decision !== 'rejected' || c.needsReview) && !turns.some((t) => Math.abs(t.atM - c.atM) <= MATCH_M),
  );
}

/** Turns as they'll be saved: street and note trimmed, an empty note left out. */
export function normalizeTurns(turns: Turn[]): Turn[] {
  return turns.map(({ atM, dir, street, note }) => {
    const n = note?.trim();
    return n ? { atM, dir, street: street.trim(), note: n } : { atM, dir, street: street.trim() };
  });
}
