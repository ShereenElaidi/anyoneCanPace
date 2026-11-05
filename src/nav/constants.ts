/**
 * Every tunable number for route following, in one place.
 * Distances are metres, times are milliseconds.
 */

/** Heads-up cue this far before a turn. */
export const HEADS_UP_M = 150;
/** "Turn now" cue this far before a turn. */
export const TURN_NOW_M = 30;
/** Within this distance past a turn, it still counts as "now" (and the banner still shows it). */
export const TURN_PASSED_GRACE_M = 10;
/**
 * A turn jumped over without a GPS gap (e.g. a jittery fix cut a sharp corner)
 * still gets a late "now" cue if it's at most this far behind. Further, or after
 * a GPS gap, it's skipped silently: missed cues are never replayed.
 */
export const LATE_TURN_MAX_M = 60;
/** No fix for this long counts as a GPS gap (phone locked, app in the background, tunnel). */
export const GPS_GAP_MS = 10_000;

/** Within this distance of the first point counts as "at the start". */
export const START_RADIUS_M = 250;
/** When starting near the start, progress is looked for only in this first stretch of the route. */
export const EARLY_WINDOW_M = 1000;

/** Further than this from the route counts as off route… */
export const OFF_ROUTE_M = 30;
/** …once it has lasted this long. */
export const OFF_ROUTE_MS = 5000;
/** Back within this distance counts as back on route (a little tighter, so it doesn't flicker). */
export const BACK_ON_ROUTE_M = 25;

/** Finishing needs at least this fraction of the route covered… */
export const FINISH_FRACTION = 0.9;
/** …and being this close to the last point (or this close to the end of the line). */
export const FINISH_RADIUS_M = 40;

/** Forward search window for each fix. It grows while no on-route fix arrives (GPS gaps, detours). */
export const FORWARD_BASE_M = 150;
/** Fastest plausible pace for growing the window: 6 m/s ≈ 2:47 /km. */
export const MAX_SPEED_MPS = 6;
/** Matches this far behind current progress are allowed (jitter) but never move progress back. */
export const BACK_TOLERANCE_M = 30;
/** Score penalty per metre ahead, so overlapping legs prefer the nearer one. */
export const ADVANCE_PENALTY_PER_M = 0.02;
/** Same idea when (re)joining anywhere on the route: earlier legs win near-ties. */
export const JOIN_PENALTY_PER_M = 0.01;

/** Fixes less accurate than this only move the GPS dot, not progress or off-route state. */
export const POOR_ACCURACY_M = 60;

/** A cue for an event older than this (e.g. after the phone slept) is shown but not buzzed. */
export const STALE_CUE_MS = 2000;
