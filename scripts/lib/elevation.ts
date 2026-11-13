/**
 * Elevation processing for the route build (scripts/build-routes.ts).
 * Pure: no file system or network.
 *
 * Input: elevations sampled every few metres along the route from a gridded
 * elevation model (DEM). Everything is measured in metres along the route, so
 * the result doesn't depend on how densely the route was sampled.
 *
 * 1. Cells, not samples. A DEM looked up by nearest cell returns the same value
 *    for every sample inside one cell, so sampling every 25 m on a 90 m grid
 *    gives stairs. Each run of identical consecutive values (up to one cell
 *    long) becomes one node at the middle of the run, and the profile is drawn
 *    as straight lines between nodes. A DEM that interpolates has no runs, so
 *    this does nothing.
 * 2. Spikes (Hampel filter). A node is compared with the median of the nodes
 *    within 1.5 cells either side: a window three cells wide, so one bad cell
 *    (a roof, a bridge deck, water) is outvoted by its neighbours. It's
 *    replaced by that median only if it's further away than both 3 robust
 *    standard deviations (3 × 1.4826 × MAD, the standard Hampel test) and the
 *    DEM's own error. A steady climb has its median in the middle and is left
 *    alone.
 * 3. Resolution limit. A grid with spacing r can't represent ups and downs
 *    shorter than 2r (the sampling theorem), so anything shorter is an
 *    artefact of where the samples fell. A centred moving average 2r wide
 *    removes it. A linear climb passes through unchanged.
 * 4. Climb and descent with hysteresis: a turn from climbing to descending
 *    (or back) only counts once the elevation has moved by more than the
 *    DEM's point-to-point error plus its rounding step. Each confirmed climb
 *    counts in full, from its low point to its high point.
 *
 * Missing values are bridged by straight lines (which adds no invented climb).
 * With fewer than two values the elevation is unknown, not zero.
 */

export interface ElevationSource {
  /** Shown in logs and the review report. */
  name: string;
  /** Grid spacing of the model, metres (the larger axis). */
  resolutionM: number;
  /** Point-to-point (relative) vertical error, metres (90 % linear error). */
  relativeErrorM: number;
  /** Values are rounded to this step, metres (0 when not rounded). */
  quantumM: number;
  /** Lookup spacing along the route, metres. */
  sampleStepM: number;
}

/**
 * Open-Meteo's Elevation API: Copernicus DEM GLO-90, 3 arc-seconds (about
 * 93 m north–south, 65 m east–west in Montréal), whole metres, nearest cell.
 * Relative accuracy < 2 m LE90 (slopes up to 20 %), from the Copernicus DEM
 * product handbook. It's a *surface* model: roofs and tree tops, not the
 * ground.
 */
export const COPERNICUS_GLO90: ElevationSource = {
  name: 'Copernicus DEM GLO-90 (surface model) via Open-Meteo',
  resolutionM: 90,
  relativeErrorM: 2,
  quantumM: 1,
  sampleStepM: 25,
};

/**
 * Natural Resources Canada's Canadian Digital Elevation Model (CDEM), a
 * *bare-earth* model: the ground, without buildings or trees. 0.75 arc-second
 * grid south of 68° N (about 23 m north–south, 16 m east–west in Montréal),
 * whole metres. Its accuracy depends on the source data and NRCan publishes no
 * single point-to-point figure, so the Copernicus 2 m is assumed. Sampled
 * every 10 m (under half a cell) so no cell along the route is skipped.
 */
export const NRCAN_CDEM: ElevationSource = {
  name: 'NRCan Canadian Digital Elevation Model (CDEM, bare earth)',
  resolutionM: 23,
  relativeErrorM: 2,
  quantumM: 1,
  sampleStepM: 10,
};

/** Elevation already in the GPX (device or planner). Its accuracy is unknown; assume GPS-grade values. */
export const GPX_ELEVATION: ElevationSource = {
  name: 'GPX <ele> values',
  resolutionM: 25,
  relativeErrorM: 2,
  quantumM: 0,
  sampleStepM: 10,
};

export const ELEVATION = {
  /** Hampel window half-width, in cells (window three cells wide). */
  despikeHalfWindowCells: 1.5,
  /** Hampel threshold, robust standard deviations. */
  despikeSigmas: 3,
  /** MAD → standard deviation for normally distributed errors. */
  madToSigma: 1.4826,
  /** Moving-average width, in cells: the shortest wavelength the grid can represent. */
  lowPassCells: 2,
  /** Profile spacing in the route JSON, metres. */
  profileStepM: 50,
};

export interface ElevationSample {
  d: number;
  ele: number | null | undefined;
}

export interface ElevationSummary {
  gainM: number;
  lossM: number;
  minEleM: number;
  maxEleM: number;
  profile: [number, number][];
}

export interface ElevationStage {
  d: number;
  /** Raw value from the source, or null where it had none. */
  raw: number | null;
  /** After cells → nodes, spike removal and gap bridging. */
  despiked: number;
  /** Final value used for the profile and the totals. */
  final: number;
}

export interface ElevationResult {
  /** Null when there's too little data to say anything. */
  summary: ElevationSummary | null;
  stages: ElevationStage[];
  spikes: { d: number; raw: number; replacedBy: number }[];
  /** Total length of route with no elevation value, metres. */
  missingM: number;
  /** Climb and descent of the raw values with the same hysteresis, for comparison. */
  rawGainM: number;
  rawLossM: number;
  thresholdM: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round1 = (v: number) => Math.round(v * 10) / 10;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Node {
  d: number;
  ele: number;
}

/**
 * One node per run of identical consecutive values (a missing value ends a
 * run). A run longer than a cell is several cells with the same value, so it
 * gives one node per cell length.
 */
export function cellNodes(samples: ElevationSample[], cellM = Infinity): Node[] {
  const nodes: Node[] = [];
  let i = 0;
  while (i < samples.length) {
    const v = samples[i].ele;
    if (!isNum(v)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < samples.length && samples[j + 1].ele === v && samples[j + 1].d - samples[i].d < cellM) j++;
    nodes.push({ d: (samples[i].d + samples[j].d) / 2, ele: v });
    i = j + 1;
  }
  return nodes;
}

/** Hampel filter on nodes, with a window measured in metres. */
export function despike(
  nodes: Node[],
  halfWindowM: number,
  floorM: number,
): { nodes: Node[]; spikes: { d: number; raw: number; replacedBy: number }[] } {
  const spikes: { d: number; raw: number; replacedBy: number }[] = [];
  const out = nodes.map((n) => {
    const win = nodes.filter((m) => Math.abs(m.d - n.d) <= halfWindowM).map((m) => m.ele);
    if (win.length < 3) return n;
    const med = median(win);
    const mad = median(win.map((x) => Math.abs(x - med)));
    const tol = Math.max(ELEVATION.despikeSigmas * ELEVATION.madToSigma * mad, floorM);
    if (Math.abs(n.ele - med) <= tol) return n;
    spikes.push({ d: Math.round(n.d), raw: n.ele, replacedBy: round1(med) });
    return { d: n.d, ele: med };
  });
  return { nodes: out, spikes };
}

/** Linear interpolation between nodes, flat beyond the first and last. */
function interpolate(nodes: Node[], d: number): number {
  if (d <= nodes[0].d) return nodes[0].ele;
  const last = nodes[nodes.length - 1];
  if (d >= last.d) return last.ele;
  let k = 1;
  while (nodes[k].d < d) k++;
  const a = nodes[k - 1];
  const b = nodes[k];
  return a.ele + ((b.ele - a.ele) * (d - a.d)) / (b.d - a.d || 1);
}

/** Centred moving average over `widthM` metres (fewer samples near the ends). */
export function movingAverage(d: number[], values: number[], widthM: number): number[] {
  const half = widthM / 2;
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i; k >= 0 && d[i] - d[k] <= half; k--) {
      sum += values[k];
      n++;
    }
    for (let k = i + 1; k < values.length && d[k] - d[i] <= half; k++) {
      sum += values[k];
      n++;
    }
    return sum / n;
  });
}

/**
 * Total climb and descent with hysteresis. Direction only changes once the
 * values have moved `thresholdM` back from the last extreme; every confirmed
 * climb or descent counts in full. Wiggles smaller than the threshold add
 * nothing.
 */
export function gainLoss(values: number[], thresholdM: number): { gainM: number; lossM: number } {
  let gain = 0;
  let loss = 0;
  if (!values.length) return { gainM: 0, lossM: 0 };
  let dir = 0;
  let turn = values[0];
  let ext = values[0];
  let lo = values[0];
  let hi = values[0];
  for (const v of values) {
    if (dir === 0) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      if (v - lo >= thresholdM) {
        dir = 1;
        turn = lo;
        ext = v;
      } else if (hi - v >= thresholdM) {
        dir = -1;
        turn = hi;
        ext = v;
      }
    } else if (dir === 1) {
      if (v > ext) ext = v;
      else if (ext - v >= thresholdM) {
        gain += ext - turn;
        turn = ext;
        ext = v;
        dir = -1;
      }
    } else if (v < ext) ext = v;
    else if (v - ext >= thresholdM) {
      loss += turn - ext;
      turn = ext;
      ext = v;
      dir = 1;
    }
  }
  if (dir === 1) gain += ext - turn;
  if (dir === -1) loss += turn - ext;
  return { gainM: gain, lossM: loss };
}

/** Cleans raw samples (see the file comment) and summarises them. */
export function processElevation(samples: ElevationSample[], source: ElevationSource): ElevationResult {
  const thresholdM = source.relativeErrorM + source.quantumM;
  const valid = samples.filter((s) => isNum(s.ele)) as { d: number; ele: number }[];
  // Length of route between the samples on either side of each run of missing values.
  let missingM = 0;
  for (let i = 0; i < samples.length; i++) {
    if (isNum(samples[i].ele)) continue;
    let j = i;
    while (j + 1 < samples.length && !isNum(samples[j + 1].ele)) j++;
    const from = samples[Math.max(0, i - 1)].d;
    const to = samples[Math.min(samples.length - 1, j + 1)].d;
    missingM += to - from;
    i = j;
  }
  const raw = gainLoss(valid.map((s) => s.ele), thresholdM);
  const empty: ElevationResult = {
    summary: null,
    stages: samples.map((s) => ({ d: s.d, raw: isNum(s.ele) ? s.ele : null, despiked: NaN, final: NaN })),
    spikes: [],
    missingM: Math.round(missingM),
    rawGainM: Math.round(raw.gainM),
    rawLossM: Math.round(raw.lossM),
    thresholdM,
  };
  if (valid.length < 2) return empty;

  const nodes = cellNodes(samples, source.resolutionM);
  const { nodes: clean, spikes } = despike(nodes, ELEVATION.despikeHalfWindowCells * source.resolutionM, thresholdM);
  const ds = samples.map((s) => s.d);
  const despiked = ds.map((d) => interpolate(clean, d));
  const final = movingAverage(ds, despiked, ELEVATION.lowPassCells * source.resolutionM);
  const { gainM, lossM } = gainLoss(final, thresholdM);

  const profile: [number, number][] = [];
  let next = 0;
  samples.forEach((s, i) => {
    if (s.d >= next - 1e-6 || i === samples.length - 1) {
      profile.push([Math.round(s.d), round1(final[i])]);
      next = s.d + ELEVATION.profileStepM;
    }
  });
  return {
    ...empty,
    summary: {
      gainM: Math.round(gainM),
      lossM: Math.round(lossM),
      minEleM: Math.round(Math.min(...final)),
      maxEleM: Math.round(Math.max(...final)),
      profile,
    },
    stages: samples.map((s, i) => ({
      d: s.d,
      raw: isNum(s.ele) ? s.ele : null,
      despiked: round1(despiked[i]),
      final: round1(final[i]),
    })),
    spikes,
  };
}
