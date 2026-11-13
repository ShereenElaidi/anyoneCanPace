/**
 * How far a route's turn-by-turn instructions have been checked by a person.
 * Pure. Lives with the route data (`verification` in src/data/routes/<id>.json);
 * `npm run routes` resets it to "unverified" whenever the geometry or turns change.
 *
 * - unverified: turns were suggested automatically (routes/review/<id>.md) and
 *   nobody has signed them off.
 * - desk-reviewed: someone checked every turn against a map or street imagery.
 * - field-verified: someone walked or ran the route following the app.
 * A reviewed status needs the reviewer and the date, so approval is never implied.
 */
import type { RouteVerification, VerificationStatus } from './types';

export type { RouteVerification, VerificationStatus };

const STATUSES: VerificationStatus[] = ['unverified', 'desk-reviewed', 'field-verified'];

/** Problems with a verification record ([] if it's valid). `today` is YYYY-MM-DD. */
export function validateVerification(v: unknown, today: string): string[] {
  if (!v || typeof v !== 'object') return ['verification is missing'];
  const r = v as Record<string, unknown>;
  const errors: string[] = [];
  if (!STATUSES.includes(r.status as VerificationStatus)) errors.push(`unknown status "${String(r.status)}"`);
  if (r.date !== undefined) {
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) {
      errors.push(`date "${String(r.date)}" is not YYYY-MM-DD`);
    } else if (r.date > today) {
      errors.push(`date ${r.date} is in the future`);
    }
  }
  if (r.status !== 'unverified') {
    if (typeof r.reviewer !== 'string' || !r.reviewer.trim()) errors.push(`${String(r.status)} needs a reviewer`);
    if (r.date === undefined) errors.push(`${String(r.status)} needs a date`);
  }
  for (const k of Object.keys(r)) {
    if (!['status', 'reviewer', 'date', 'notes'].includes(k)) errors.push(`unknown field "${k}"`);
  }
  return errors;
}

/** Short label and an explanation for the route list and route page. Always text, never colour alone. */
export function verificationText(v: RouteVerification | undefined): { label: string; detail: string } {
  const by = v?.reviewer && v?.date ? ` by ${v.reviewer} on ${v.date}` : '';
  switch (v?.status) {
    case 'field-verified':
      return { label: 'Field-checked', detail: `Walked and checked on the ground${by}.` };
    case 'desk-reviewed':
      return {
        label: 'Map-checked',
        detail: `Turns were checked against a map${by}, but nobody has walked it with the app yet. Watch the street signs.`,
      };
    default:
      return {
        label: 'Unverified',
        detail:
          'The turn-by-turn directions were suggested automatically and haven’t been checked by a person or on the ground. Treat them as hints and watch the street signs.',
      };
  }
}
