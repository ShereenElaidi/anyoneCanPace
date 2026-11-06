/**
 * Route editor: pure helpers for the review panel, the advisories form and
 * the map coverage check.
 */
import type { Advisory, RouteVerification, VerificationStatus } from '../../nav/types';

export type ReviewedStatus = Exclude<VerificationStatus, 'unverified'>;

/** What the person confirms before marking a route reviewed. Never implied, never a default. */
export const REVIEW_CHECK: Record<ReviewedStatus, string> = {
  'desk-reviewed':
    'I checked every turn, street name and note against a map or street imagery (routes/review/<id>.md lists what the build was unsure about).',
  'field-verified':
    'Someone walked or ran the whole route following the app, and every wrong, late or missing cue has been fixed.',
};

/** The verification record to save. Reviewer and notes trimmed; empty notes left out. */
export function reviewRecord(status: VerificationStatus, reviewer: string, date: string, notes: string): RouteVerification {
  const n = notes.trim();
  if (status === 'unverified') return n ? { status, notes: n } : { status };
  return n ? { status, reviewer: reviewer.trim(), date, notes: n } : { status, reviewer: reviewer.trim(), date };
}

/** The line to add to the reviewed list in src/nav/verification.test.ts. */
export function reviewedListLine(id: string, v: RouteVerification): string {
  return `'${id}': true, // ${v.status} by ${v.reviewer ?? '?'}, ${v.date ?? '?'}`;
}

export interface AdvisoryForm {
  text: string;
  fromKm: string;
  toKm: string;
  start: string;
  end: string;
  source: string;
}

export const emptyAdvisory: AdvisoryForm = { text: '', fromKm: '', toKm: '', start: '', end: '', source: '' };

export function advisoryToForm(a: Advisory): AdvisoryForm {
  return {
    text: a.text,
    fromKm: a.fromKm === undefined ? '' : String(a.fromKm),
    toKm: a.toKm === undefined ? '' : String(a.toKm),
    start: a.start ?? '',
    end: a.end ?? '',
    source: a.source ?? '',
  };
}

/** The advisory to save: trimmed, empty fields left out, km as numbers (unparseable km kept as text so validation reports it). */
export function formToAdvisory(f: AdvisoryForm): Advisory {
  const km = (s: string) => {
    const t = s.trim().replace(',', '.');
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : (t as unknown as number);
  };
  const out: Advisory = { text: f.text.trim() };
  const fromKm = km(f.fromKm);
  const toKm = km(f.toKm);
  if (fromKm !== undefined) out.fromKm = fromKm;
  if (toKm !== undefined) out.toKm = toKm;
  if (f.start.trim()) out.start = f.start.trim();
  if (f.end.trim()) out.end = f.end.trim();
  if (f.source.trim()) out.source = f.source.trim();
  return out;
}

export interface MapBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * How much of a route's box ([west, south, east, north]) the offline street
 * map covers: "inside", "partly" (some of it is off the map), or "outside".
 */
export function mapCoverage(bbox: [number, number, number, number], map: MapBounds): 'inside' | 'partly' | 'outside' {
  const [w, s, e, n] = bbox;
  if (w >= map.minLon && e <= map.maxLon && s >= map.minLat && n <= map.maxLat) return 'inside';
  const overlaps = w < map.maxLon && e > map.minLon && s < map.maxLat && n > map.minLat;
  return overlaps ? 'partly' : 'outside';
}
