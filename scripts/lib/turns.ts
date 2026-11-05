/**
 * Turn suggestions for the route build (scripts/build-routes.ts).
 *
 * Pure: no file system or network. Everything here is a *suggestion* for a
 * person to check against the map or on the ground; the review report keeps
 * every candidate and the reason for each decision.
 *
 * How it works:
 * 1. Seeds: vertices of the simplified track where the heading over a short
 *    arm before and after changes by at least `minDeg`. A gentle curve never
 *    reaches that over the short arm, so it produces no seeds.
 * 2. Clusters: seeds closer than the app can announce separately (its "now"
 *    cue distance plus the grace distance past a turn) are one candidate
 *    manoeuvre. A street crossing done in two or three tiny moves is one
 *    cluster, and so is a rounded corner.
 * 3. Net change: the heading of the approach leg (before the cluster) versus
 *    the exit leg (after it). Net change below `minDeg` means the runner keeps
 *    going the same way.
 * 4. Model check: the cluster is replaced by one simple manoeuvre (carry
 *    straight on, or one turn at the corner where the approach and exit legs
 *    meet). If the real route stays within `toleranceM` of that simple path,
 *    the simplification is safe. If not (a dogleg onto another street, going
 *    round a short block), the separate turns are kept and flagged.
 * 5. Street names are matched per leg, only to streets that run the same way
 *    as the route there, so a cross street at a corner doesn't get the vote.
 *    A name change alone never creates a turn.
 */
import {
  bearingDeg,
  createProjector,
  headingChange,
  perpendicularDistance,
  projectOnSegment,
  type LatLon,
  type XY,
} from '../../src/nav/geo.ts';
import { OFF_ROUTE_M, TURN_NOW_M, TURN_PASSED_GRACE_M } from '../../src/nav/constants.ts';
import type { TurnDir } from '../../src/nav/types.ts';
import { pointAlong } from './process-route.ts';

export const TURNS = {
  /** Heading measured over this distance before and after each vertex to find seeds. */
  armM: 20,
  /**
   * Smaller heading changes are bends, not turns. Over the 2 × 20 m arm this
   * ignores any curve with a radius above about 65 m.
   */
  minDeg: 35,
  /**
   * Seeds closer than this are one manoeuvre: the app shows a turn until 10 m
   * past it and cues "now" 30 m before the next, so two turns closer than
   * 40 m can't be announced separately anyway.
   */
  clusterGapM: TURN_NOW_M + TURN_PASSED_GRACE_M,
  /** Approach and exit legs are measured over this distance (the "now" cue distance). */
  legM: TURN_NOW_M,
  /**
   * The route may stray this far from the one-manoeuvre simplification: about
   * one Montréal street right-of-way (66 ft, building line to building line).
   * Moving sideways by less than that is crossing the street or changing
   * sidewalk; more is a different street (a dogleg, a short block).
   */
  toleranceM: 20,
  /** A consolidated or rejected cluster whose route strays more than this from the simple path is flagged for review. */
  reviewDeviationM: 5,
  /** Turns closer than this to the start are folded into the start instruction. */
  startZoneM: TURN_NOW_M,
  /** A street must run within this many degrees of the route's heading to be "the street you're on". */
  streetMaxAngleDeg: 35,
  /** …and be at most this far from the route. */
  streetMaxDistM: 15,
  /** Street names are looked up over up to this much of each leg, skipping this much next to each turn. */
  streetLegM: 60,
  streetCornerM: 10,
};

export interface ProposedTurn {
  atM: number;
  dir: TurnDir;
  /** Net heading change, degrees; positive turns right. */
  angle: number;
}

export interface Street {
  name: string;
  /** [lon, lat] pairs. */
  coords: [number, number][];
}

export type TurnDecision = 'retained' | 'consolidated' | 'rejected';

export interface TurnReviewEntry {
  /** Distance along the route of the instruction (or of the rejected candidate). */
  atM: number;
  /** Instruction direction, or the direction the candidate would have had. */
  dir: TurnDir;
  /** Net heading change, degrees. */
  angle: number;
  streetBefore: string;
  streetAfter: string;
  decision: TurnDecision;
  reason: string;
  /** True when a person should look at this one before trusting it. */
  needsReview: boolean;
  /** Raw seeds that make up this candidate. */
  components: { atM: number; angle: number }[];
  /** Largest distance between the route and the simplified manoeuvre, metres. */
  deviationM: number;
}

export interface TurnAnalysis {
  /** Suggested instructions, in route order. Streets may be empty when unknown. */
  turns: (ProposedTurn & { street: string })[];
  /** Street of the first leg, or '' when no street matches it. */
  startStreet: string;
  startNote: string;
  review: TurnReviewEntry[];
}

export function turnDir(angle: number): TurnDir {
  const a = Math.abs(angle);
  const side = angle < 0 ? 'left' : 'right';
  if (a >= 160) return 'u-turn';
  if (a >= 125) return `sharp-${side}`;
  if (a >= 60) return side;
  return `slight-${side}`;
}

// ---------- Geometry helpers ----------

/** Route between two distances as a polyline, including the vertices in between. */
function slice(points: LatLon[], cum: number[], fromM: number, toM: number): LatLon[] {
  const out = [pointAlong(points, cum, fromM)];
  for (let i = 0; i < points.length; i++) if (cum[i] > fromM && cum[i] < toM) out.push(points[i]);
  out.push(pointAlong(points, cum, toM));
  return out;
}

/** Points every `stepM` along a polyline in planar coordinates. */
function densify(line: XY[], stepM = 2): XY[] {
  const out: XY[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / stepM));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function distToPolyline(p: XY, line: XY[]): number {
  if (line.length === 1) return Math.hypot(p.x - line[0].x, p.y - line[0].y);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, projectOnSegment(p, line[i - 1], line[i]).distM);
  return best;
}

/** Symmetric Hausdorff distance between two polylines (sampled every 2 m). */
function hausdorff(a: XY[], b: XY[]): number {
  let worst = 0;
  for (const p of densify(a)) worst = Math.max(worst, distToPolyline(p, b));
  for (const p of densify(b)) worst = Math.max(worst, distToPolyline(p, a));
  return worst;
}

/** Intersection of line a0→a1 with line b0→b1, or null when (nearly) parallel. */
function intersect(a0: XY, a1: XY, b0: XY, b1: XY): XY | null {
  const r = { x: a1.x - a0.x, y: a1.y - a0.y };
  const s = { x: b1.x - b0.x, y: b1.y - b0.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9 * Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)) return null;
  const t = ((b0.x - a0.x) * s.y - (b0.y - a0.y) * s.x) / den;
  return { x: a0.x + t * r.x, y: a0.y + t * r.y };
}

/** Heading change at distance d, measured over arms of `armM` (clipped at the route ends). */
function armAngle(points: LatLon[], cum: number[], d: number, armM: number): number {
  const total = cum[cum.length - 1];
  const before = pointAlong(points, cum, Math.max(0, d - armM));
  const at = pointAlong(points, cum, d);
  const after = pointAlong(points, cum, Math.min(total, d + armM));
  return headingChange(bearingDeg(before, at), bearingDeg(at, after));
}

// ---------- Street names ----------

interface PreparedStreet {
  name: string;
  coords: LatLon[];
}

function prepareStreets(streets: Street[]): PreparedStreet[] {
  return streets.map((s) => ({ name: s.name, coords: s.coords.map(([lon, lat]) => ({ lat, lon })) }));
}

/**
 * Name of the street the route runs along between two distances: a majority
 * vote of samples every 5 m, where each sample votes for the nearest street
 * that runs the same way as the route (within `streetMaxAngleDeg`, either
 * direction). Returns '' when nothing matches. Never guesses.
 */
export function streetAlong(points: LatLon[], cum: number[], streets: Street[], fromM: number, toM: number): string {
  return streetAlongPrepared(points, cum, prepareStreets(streets), fromM, toM);
}

function streetAlongPrepared(points: LatLon[], cum: number[], prepared: PreparedStreet[], fromM: number, toM: number): string {
  const total = cum[cum.length - 1];
  const from = Math.max(0, fromM);
  const to = Math.min(total, toM);
  if (to - from < 1 || !prepared.length) return '';
  const votes = new Map<string, number>();
  const step = 5;
  for (let d = from; d <= to + 1e-6; d += step) {
    const p = pointAlong(points, cum, d);
    const heading = bearingDeg(pointAlong(points, cum, Math.max(0, d - 2)), pointAlong(points, cum, Math.min(total, d + 2)));
    const proj = createProjector(p);
    const origin = { x: 0, y: 0 };
    let bestName = '';
    let best = TURNS.streetMaxDistM;
    for (const s of prepared) {
      let prev = proj.toXY(s.coords[0]);
      for (let i = 1; i < s.coords.length; i++) {
        const cur = proj.toXY(s.coords[i]);
        const dist = projectOnSegment(origin, prev, cur).distM;
        if (dist < best) {
          const segBearing = (Math.atan2(cur.x - prev.x, cur.y - prev.y) * 180) / Math.PI;
          const diff = Math.abs(headingChange(heading, segBearing));
          if (Math.min(diff, 180 - diff) <= TURNS.streetMaxAngleDeg) {
            best = dist;
            bestName = s.name;
          }
        }
        prev = cur;
      }
    }
    if (bestName) votes.set(bestName, (votes.get(bestName) ?? 0) + 1);
  }
  let winner = '';
  let max = 0;
  for (const [name, n] of votes) {
    if (n > max) {
      max = n;
      winner = name;
    }
  }
  return winner;
}

/** Street just after distance `atM`, staying short of `limitM` (the next turn). */
function streetAfterTurn(points: LatLon[], cum: number[], streets: PreparedStreet[], atM: number, limitM: number): string {
  const c = TURNS.streetCornerM;
  let from = atM + c;
  let to = Math.min(atM + TURNS.streetLegM, limitM - c);
  if (to - from < c) {
    // Short leg: use what there is, corners included.
    from = atM + 2;
    to = Math.max(from + 1, limitM - 2);
  }
  return streetAlongPrepared(points, cum, streets, from, to);
}

function streetBeforeTurn(points: LatLon[], cum: number[], streets: PreparedStreet[], atM: number, limitM: number): string {
  const c = TURNS.streetCornerM;
  let from = Math.max(atM - TURNS.streetLegM, limitM + c);
  let to = atM - c;
  if (to - from < c) {
    from = limitM + 2;
    to = Math.max(from + 1, atM - 2);
  }
  return streetAlongPrepared(points, cum, streets, from, to);
}

// ---------- Turns ----------

interface Seed {
  atM: number;
  angle: number;
}

/** Vertices where the heading over the short arm changes by at least `minDeg`. */
function findSeeds(points: LatLon[], cum: number[]): Seed[] {
  const total = cum[cum.length - 1];
  const seeds: Seed[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const d = cum[i];
    // Arms are clipped at the ends; a vertex needs a few metres either side to have a heading.
    if (d < 5 || total - d < 5) continue;
    const angle = armAngle(points, cum, d, TURNS.armM);
    if (Math.abs(angle) >= TURNS.minDeg) seeds.push({ atM: d, angle });
  }
  return seeds;
}

interface Evaluated {
  seeds: Seed[];
  atM: number;
  angle: number;
  deviationM: number;
  simple: boolean;
}

/** Measures one cluster against its one-manoeuvre simplification. */
function evaluateCluster(points: LatLon[], cum: number[], seeds: Seed[], prevEndM: number, nextStartM: number): Evaluated {
  const total = cum[cum.length - 1];
  const s = seeds[0].atM;
  const e = seeds[seeds.length - 1].atM;
  const a0d = Math.max(0, prevEndM, s - TURNS.legM);
  const e1d = Math.min(total, nextStartM, e + TURNS.legM);
  const A0 = pointAlong(points, cum, a0d);
  const S = pointAlong(points, cum, s);
  const E = pointAlong(points, cum, e);
  const E1 = pointAlong(points, cum, e1d);
  // Legs too short to have a heading (route ends) fall back to the seed arm.
  const approach = s - a0d >= 3 ? bearingDeg(A0, S) : bearingDeg(pointAlong(points, cum, Math.max(0, s - TURNS.armM)), S);
  const exit = e1d - e >= 3 ? bearingDeg(E, E1) : bearingDeg(E, pointAlong(points, cum, Math.min(total, e + TURNS.armM)));
  const angle = headingChange(approach, exit);

  const proj = createProjector(S);
  const route = slice(points, cum, a0d, e1d).map(proj.toXY);
  const a0 = proj.toXY(A0);
  const sXY = proj.toXY(S);
  const eXY = proj.toXY(E);
  const e1 = proj.toXY(E1);
  // Where the runner turns: the strongest seed turning the same way as the net change.
  const pivot = seeds.reduce((best, c) =>
    Math.sign(c.angle) === Math.sign(angle) && Math.abs(c.angle) > Math.abs(best.angle) ? c : best,
  );
  let model: XY[];
  // When the exit leg is parallel to the approach leg (same way or back the
  // way it came) the two can be a whole block apart: a dogleg, or going round
  // a short block rather than a U-turn. Measured at the manoeuvre itself (its
  // end from the approach line, its start from the exit line), so a small
  // angle between the legs doesn't add drift.
  let sideways = 0;
  if (isParallel(angle)) {
    const hasApproach = Math.hypot(sXY.x - a0.x, sXY.y - a0.y) > 1;
    const hasExit = Math.hypot(e1.x - eXY.x, e1.y - eXY.y) > 1;
    if (hasApproach && hasExit) {
      sideways = Math.min(perpendicularDistance(eXY, a0, sXY), perpendicularDistance(sXY, eXY, e1));
    }
  }
  if (Math.abs(angle) < TURNS.minDeg) {
    model = [a0, e1];
  } else {
    let corner = intersect(a0, sXY, eXY, e1);
    const pivotXY = proj.toXY(pointAlong(points, cum, pivot.atM));
    // An intersection far from the cluster (legs nearly parallel) isn't a corner.
    if (!corner || Math.hypot(corner.x - pivotXY.x, corner.y - pivotXY.y) > TURNS.clusterGapM) corner = pivotXY;
    model = [a0, corner, e1];
  }
  const deviationM = Math.max(hausdorff(route, model), sideways);
  return { seeds, atM: pivot.atM, angle, deviationM, simple: deviationM <= TURNS.toleranceM };
}

const fmt = (v: number) => `${Math.round(v)}`;

/** Exit leg parallel to the approach leg: carrying on the same way, or coming back. */
const isParallel = (angle: number) => Math.abs(angle) < TURNS.minDeg || Math.abs(angle) > 180 - TURNS.minDeg;

/**
 * Proposes turns and a start street, with a review entry for every candidate.
 * Pass `streets` (OpenStreetMap named ways near the route) to fill names.
 */
export function analyseTurns(points: LatLon[], cum: number[], streets: Street[] = []): TurnAnalysis {
  const total = cum[cum.length - 1];
  const prepared = prepareStreets(streets);
  const seeds = findSeeds(points, cum);

  // 1. Cluster seeds that the app couldn't announce separately.
  const clusters: Seed[][] = [];
  for (const sd of seeds) {
    const last = clusters[clusters.length - 1];
    if (last && sd.atM - last[last.length - 1].atM < TURNS.clusterGapM) last.push(sd);
    else clusters.push([sd]);
  }

  // 2. Decide each cluster.
  type Draft = Omit<TurnReviewEntry, 'streetBefore' | 'streetAfter'>;
  const drafts: Draft[] = [];
  const decide = (cluster: Seed[], prevEnd: number, nextStart: number, splitFrom = 0) => {
    const ev = evaluateCluster(points, cum, cluster, prevEnd, nextStart);
    const components = cluster.map((c) => ({ atM: Math.round(c.atM), angle: Math.round(c.angle) }));
    const span = cluster[cluster.length - 1].atM - cluster[0].atM;
    const many = cluster.length > 1;
    const noNet = Math.abs(ev.angle) < TURNS.minDeg;
    const split = splitFrom > 1 ? ` (one of the manoeuvres in a ${splitFrom}-move cluster)` : '';
    const base = {
      atM: Math.round(ev.atM),
      dir: turnDir(ev.angle),
      angle: Math.round(ev.angle),
      components,
      deviationM: round1(ev.deviationM),
    };

    if (ev.simple && noNet) {
      drafts.push({
        ...base,
        decision: 'rejected',
        reason: many
          ? `${cluster.length} heading changes within ${fmt(span)} m cancel out (net ${fmt(ev.angle)}°); the route stays within ${fmt(ev.deviationM)} m of the straight line, so this is a jog (crossing, lane or sidewalk change), not a turn${split}`
          : `heading changes ${fmt(cluster[0].angle)}° locally but only ${fmt(ev.angle)}° between the approach and exit legs (a kink in the line)${split}`,
        needsReview: ev.deviationM > TURNS.reviewDeviationM,
      });
      return;
    }
    if (ev.simple) {
      drafts.push({
        ...base,
        decision: many ? 'consolidated' : 'retained',
        reason: many
          ? `${cluster.length} heading changes within ${fmt(span)} m make one ${fmt(ev.angle)}° manoeuvre; the route stays within ${fmt(ev.deviationM)} m of a single turn${split}`
          : `${fmt(ev.angle)}° change of direction${split}`,
        needsReview: splitFrom > 1 || (many && ev.deviationM > TURNS.reviewDeviationM),
      });
      return;
    }
    // Not simple, and the exit is parallel to the approach but a block to the
    // side: a dogleg (same way) or round a short block (back the other way).
    // Two instructions describe it, the first move and the last; anything in
    // between is wiggle inside the junction.
    if (many && isParallel(ev.angle)) {
      const what = noNet ? 'a dogleg' : 'going round a short block (not a U-turn)';
      const ends = [cluster[0], cluster[cluster.length - 1]];
      const middle = cluster.length - 2;
      ends.forEach((c, i) => {
        drafts.push({
          atM: Math.round(c.atM),
          dir: turnDir(c.angle),
          angle: Math.round(c.angle),
          decision: 'retained',
          reason: `${i ? 'second' : 'first'} half of ${what}: ${cluster.length} heading changes within ${fmt(span)} m (net ${fmt(ev.angle)}°), and the exit is ${fmt(ev.deviationM)} m to the side of the approach${middle ? `; ${middle} smaller move${middle > 1 ? 's' : ''} in between dropped` : ''}. The app may announce both close together`,
          needsReview: true,
          components: i ? cluster.slice(1).map((m) => ({ atM: Math.round(m.atM), angle: Math.round(m.angle) })) : [{ atM: Math.round(c.atM), angle: Math.round(c.angle) }],
          deviationM: round1(ev.deviationM),
        });
      });
      return;
    }
    // One instruction would put the runner off route by the app's own standard: split it.
    if (many && ev.deviationM > OFF_ROUTE_M) {
      let g = 0;
      for (let i = 1; i < cluster.length - 1; i++) {
        if (cluster[i + 1].atM - cluster[i].atM > cluster[g + 1].atM - cluster[g].atM) g = i;
      }
      const left = cluster.slice(0, g + 1);
      const right = cluster.slice(g + 1);
      const parts = splitFrom || cluster.length;
      decide(left, prevEnd, right[0].atM, parts);
      decide(right, left[left.length - 1].atM, nextStart, parts);
      return;
    }
    // One instruction for the net change, flagged: the geometry is more complicated than it says.
    const seed = cluster.length === 1 ? cluster[0] : null;
    const angle = noNet && seed ? seed.angle : ev.angle;
    // Cue it where it starts: the first move that turns the same way as the whole manoeuvre.
    const first = cluster.find((c) => Math.sign(c.angle) === Math.sign(angle)) ?? cluster[0];
    drafts.push({
      ...base,
      atM: Math.round(first.atM),
      dir: turnDir(angle),
      angle: Math.round(angle),
      decision: many ? 'consolidated' : 'retained',
      reason: `complex manoeuvre: ${cluster.length} heading change${many ? 's' : ''} within ${fmt(span)} m, net ${fmt(ev.angle)}°, and the route is up to ${fmt(ev.deviationM)} m from a single turn (a loop, ramp or dogleg?). Check it on the map and add a note${split}`,
      needsReview: true,
    });
  };
  clusters.forEach((cluster, k) => {
    const prevEnd = k > 0 ? clusters[k - 1][clusters[k - 1].length - 1].atM : 0;
    const nextStart = k < clusters.length - 1 ? clusters[k + 1][0].atM : total;
    decide(cluster, prevEnd, nextStart);
  });

  // 3. A turn inside the start zone is the start itself: the runner sets off in the new direction.
  let startNote = '';
  for (const d of drafts) {
    if (d.decision !== 'rejected' && d.atM < TURNS.startZoneM) {
      d.decision = 'rejected';
      d.reason = `${d.atM} m from the start, inside the ${TURNS.startZoneM} m start zone: folded into the start instruction`;
      d.needsReview = true;
      startNote = `A ${d.dir} turn ${d.atM} m after the first point was folded into the start; check where the route really starts.`;
    }
  }

  // 4. Street names, per leg between kept instructions.
  const name = () => {
    const kept = drafts.filter((d) => d.decision !== 'rejected');
    return drafts.map((d): TurnReviewEntry => {
      const prevAt = kept.filter((x) => x.atM < d.atM).at(-1)?.atM ?? 0;
      const nextAt = kept.find((x) => x.atM > d.atM)?.atM ?? total;
      return {
        ...d,
        // Before the cluster's first move and after its last one.
        streetBefore: streetBeforeTurn(points, cum, prepared, Math.min(d.atM, d.components[0].atM), prevAt),
        streetAfter: streetAfterTurn(points, cum, prepared, Math.max(d.atM, d.components[d.components.length - 1].atM), nextAt),
      };
    });
  };
  let review = name();

  // 5. A small kink or jog where the named way changes may be a fork (road onto
  //    a path, say). Heading alone can't tell, so keep it as a bear instruction
  //    and flag it rather than drop a possibly real manoeuvre.
  let promoted = false;
  review.forEach((r, i) => {
    const d = drafts[i];
    if (d.decision !== 'rejected' || d.atM < TURNS.startZoneM) return;
    if (!r.streetBefore || !r.streetAfter || r.streetBefore === r.streetAfter) return;
    const lead = d.components.length > 1 ? d.components[0].angle : d.angle;
    d.dir = lead < 0 ? 'slight-left' : 'slight-right';
    d.decision = 'retained';
    d.needsReview = true;
    d.reason = `kept: the street changes from ${r.streetBefore} to ${r.streetAfter} here, so this may be a fork even though the heading barely changes (${d.reason})`;
    promoted = true;
  });
  if (promoted) review = name();

  const kept = drafts.filter((d) => d.decision !== 'rejected');
  const firstKept = kept[0]?.atM ?? total;
  const startStreet = streetAlongPrepared(points, cum, prepared, 0, Math.min(TURNS.streetLegM, firstKept - TURNS.streetCornerM));
  if (!startStreet && !startNote) {
    startNote = `No named street runs along the first ${fmt(Math.min(TURNS.streetLegM, firstKept))} m; check where the route starts.`;
  }

  for (const r of review) {
    if (r.decision === 'rejected') continue;
    const notes: string[] = [];
    if (!r.streetAfter) notes.push('no street name found after the turn');
    else if (r.streetAfter === r.streetBefore) notes.push('same street before and after: a bend in the road or a turn that stays on it');
    if (notes.length) {
      r.needsReview = true;
      r.reason += `; ${notes.join('; ')}`;
    }
  }

  const turns = review
    .filter((r) => r.decision !== 'rejected')
    .map((r) => ({ atM: r.atM, dir: r.dir, angle: r.angle, street: r.streetAfter }));
  return { turns, startStreet, startNote, review };
}

/** Suggested turns only (no street names). */
export function proposeTurns(points: LatLon[], cum: number[]): ProposedTurn[] {
  return analyseTurns(points, cum).turns.map(({ atM, dir, angle }) => ({ atM, dir, angle }));
}

const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------- Review report ----------

const DIR_WORD: Record<TurnDir, string> = {
  left: 'Left',
  right: 'Right',
  'slight-left': 'Bear left',
  'slight-right': 'Bear right',
  'sharp-left': 'Sharp left',
  'sharp-right': 'Sharp right',
  'u-turn': 'U-turn',
  straight: 'Straight',
};

const km = (m: number) => (m / 1000).toFixed(2);
const cell = (s: string) => (s ? s.replace(/\|/g, '\\|') : '*unknown*');

/** Markdown table of every turn candidate, for a person to check. */
export function turnReviewMarkdown(analysis: TurnAnalysis): string {
  const lines = [
    `Start street: ${cell(analysis.startStreet)}${analysis.startNote ? ` (${analysis.startNote})` : ''}`,
    '',
    '| km | Suggestion | Angle | Street before | Street after | Decision | Review? | Reason |',
    '| --: | --- | --: | --- | --- | --- | :-: | --- |',
  ];
  for (const r of analysis.review) {
    const what = r.decision === 'rejected' ? `~~${DIR_WORD[r.dir]}~~` : DIR_WORD[r.dir];
    lines.push(
      `| ${km(r.atM)} | ${what} | ${r.angle > 0 ? '+' : ''}${r.angle}° | ${cell(r.streetBefore)} | ${cell(r.streetAfter)} | ${r.decision} | ${r.needsReview ? 'yes' : ''} | ${r.reason} |`,
    );
  }
  return lines.join('\n') + '\n';
}
