/**
 * Shapes of the processed route files in `src/data/routes/`.
 * Written by `scripts/build-routes.ts`; `name`, `turns`, `notes`,
 * `advisories` and `verification` are then edited by hand and kept when the
 * script re-runs (turns only while the geometry is unchanged).
 */

/** See src/nav/verification.ts for what each status means and how it is validated. */
export type VerificationStatus = 'unverified' | 'desk-reviewed' | 'field-verified';

export interface RouteVerification {
  status: VerificationStatus;
  reviewer?: string;
  /** YYYY-MM-DD */
  date?: string;
  notes?: string;
}

export type TurnDir =
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'u-turn'
  | 'straight';

export type RouteKind = 'loop' | 'out-and-back' | 'point-to-point';

export interface Turn {
  /** Distance along the route, metres. */
  atM: number;
  dir: TurnDir;
  /** Street you turn onto. May be empty. */
  street: string;
  note?: string;
}

export interface RouteStats {
  distanceM: number;
  gainM: number;
  lossM: number;
  minEleM: number;
  maxEleM: number;
}

export interface Advisory {
  text: string;
  /** Optional range along the route this applies to, in km. */
  fromKm?: number;
  toKm?: number;
  /** ISO dates (YYYY-MM-DD). */
  start?: string;
  end?: string;
  source?: string;
}

export interface RouteSource {
  name: string;
  url?: string;
  attribution: string;
}

export interface RouteData {
  id: string;
  name: string;
  kind: RouteKind;
  stats: RouteStats;
  /** File name of the GeoJSON track next to this file. */
  track: string;
  /** Street at the start, for "Continue on X" before the first turn. */
  startStreet?: string;
  /** Hand-written: where the route is, for the library ("Downtown → Old Port"). */
  place?: string;
  /** Hand-written: a short paragraph on what the route is like, for the route page only (not the manifest). */
  description?: string;
  /** Hand-written tag ids from ROUTE_TAGS (src/sixk/describe.ts), e.g. "waterfront". */
  tags?: string[];
  /** [west, south, east, north]. */
  bbox: [number, number, number, number];
  /** Smoothed elevation profile: [distanceM, elevationM] pairs. */
  profile: [number, number][];
  turns: Turn[];
  notes: string[];
  advisories: Advisory[];
  source?: RouteSource;
  /** Whether a person has checked the turns. Reset to unverified when geometry or turns change. */
  verification: RouteVerification;
  /** Fingerprint of the processed track; turn distances are only valid for this geometry. */
  geometry: string;
}

/** One entry in `manifest.json`, enough to draw the library list. */
export interface RouteSummary {
  id: string;
  name: string;
  kind: RouteKind;
  stats: RouteStats;
  /** SVG path in a 0..100 box, for the list thumbnail. */
  outline: string;
  verification: VerificationStatus;
  place?: string;
  tags?: string[];
}

export interface RouteManifest {
  routes: RouteSummary[];
}

/** The processed track: a GeoJSON LineString of [lon, lat] pairs. */
export interface TrackFeature {
  type: 'Feature';
  properties: { id: string; distancesM: number[] };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}
