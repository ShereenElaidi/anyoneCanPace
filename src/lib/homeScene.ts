/**
 * Which picture the home screen shows. Usually the riverside duck; for a
 * holiday, a one-off scene until a fixed time. Pure: `now` is passed in.
 *
 * Diwali 2026: the duck says "Happy Diwali!" until Monday 9 November 2026,
 * 12:00 in Montréal (EST, UTC−5). Remove the entry (and its picture) once it's over.
 */
export interface SpecialScene {
  id: 'diwali';
  /** Shown before this time (ms since epoch), then the usual scene comes back. */
  endsAt: number;
}

export const DIWALI_2026: SpecialScene = { id: 'diwali', endsAt: Date.UTC(2026, 10, 9, 17, 0) };

const SPECIAL: SpecialScene[] = [DIWALI_2026];

/** The special scene for `now`, or null for the usual one. */
export function specialScene(now: number): SpecialScene | null {
  return SPECIAL.find((s) => now < s.endsAt) ?? null;
}
