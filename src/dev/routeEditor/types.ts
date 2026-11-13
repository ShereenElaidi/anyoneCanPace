/**
 * Shapes the route editor's API sends and receives, shared by the page and the
 * dev-server code (server/api.ts). No Node or DOM imports, so both sides can use it.
 */
import type { RouteData, RouteSource, TrackFeature, VerificationStatus } from '../../nav/types';
import type { TagDef } from '../../sixk/describe';

export interface RouteConfig {
  id: string;
  gpx: string;
  name: string;
  source?: RouteSource;
  /** Recorded on a run (not drawn on a map): its turns need a closer look. Build-time only. */
  recorded?: boolean;
}

export type TagList = Record<string, TagDef>;

export interface BuildResult {
  ok: boolean;
  log: string;
}

export interface RouteListItem {
  id: string;
  name: string;
  gpx: string;
  source: RouteSource | null;
  recorded: boolean;
  built: boolean;
  verification: VerificationStatus | null;
  distanceM: number | null;
  place: string | null;
  tags: string[];
}

export interface RouteList {
  today: string;
  routes: RouteListItem[];
  tags: TagList;
}

/** One candidate turn from routes/review/<id>.json (the build's suggestions). */
export interface ReviewTurn {
  atM: number;
  dir: string;
  decision: string;
  reason: string;
  needsReview: boolean;
  streetBefore?: string;
  streetAfter?: string;
}

export interface RouteDetail {
  config: RouteConfig;
  data: RouteData | null;
  track: TrackFeature | null;
  review: { startStreet?: string; startNote?: string; turns?: ReviewTurn[] } | null;
  tags: TagList;
  today: string;
}

export interface NewRoute {
  id: string;
  name: string;
  gpx: string;
  source: RouteSource;
  recorded: boolean;
}

export interface AddRouteResult {
  id: string;
  points: number;
  removed: string[];
  build: BuildResult;
}

export interface SaveRouteResult {
  data: RouteData;
  verificationReset: boolean;
  build: BuildResult;
}
