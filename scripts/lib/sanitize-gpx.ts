/**
 * Cleans an uploaded GPX before it is saved to routes/ (which is committed to
 * a public repository). Keeps only what the route build reads: the track
 * points' latitude, longitude and elevation. Everything else is dropped:
 * timestamps, heart rate, cadence and other sensor data, <extensions>,
 * <metadata> (author, device, links), waypoints, and the original names,
 * which can carry a person's name or "Morning Run from home".
 * Pure: string in, string out.
 */
import { parseGpx } from './process-route.ts';

export interface SanitizedGpx {
  gpx: string;
  points: number;
  /** What was removed, in plain words, e.g. "2,140 timestamps". Empty if the file was already clean. */
  removed: string[];
}

const count = (xml: string, re: RegExp) => xml.match(re)?.length ?? 0;

const REMOVABLE: { re: RegExp; one: string; many: string }[] = [
  { re: /<time\b/g, one: 'timestamp', many: 'timestamps' },
  { re: /<(?:\w+:)?hr\b/g, one: 'heart-rate reading', many: 'heart-rate readings' },
  { re: /<(?:\w+:)?cad\b/g, one: 'cadence reading', many: 'cadence readings' },
  { re: /<(?:\w+:)?(?:atemp|wtemp)\b/g, one: 'temperature reading', many: 'temperature readings' },
  { re: /<(?:\w+:)?power\b/g, one: 'power reading', many: 'power readings' },
  { re: /<extensions\b/g, one: 'block of device extensions', many: 'blocks of device extensions' },
  { re: /<wpt\b/g, one: 'waypoint', many: 'waypoints' },
  { re: /<metadata\b/g, one: 'metadata block (author, device, links)', many: 'metadata blocks (author, device, links)' },
  { re: /<name\b/g, one: 'name', many: 'names' },
  { re: /<(?:desc|cmt)\b/g, one: 'description or comment', many: 'descriptions or comments' },
];

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * A minimal GPX 1.1 track with `name` as its only name. Coordinates are kept
 * to 6 decimals (about 0.1 m) and elevation to 0.1 m. Throws if the file has
 * fewer than two usable track or route points.
 */
export function sanitizeGpx(xml: string, name: string): SanitizedGpx {
  const { points } = parseGpx(xml);
  if (points.length < 2) throw new Error('This GPX has no track: it needs at least two track or route points.');
  const removed = REMOVABLE.flatMap(({ re, one, many }) => {
    const n = count(xml, re);
    return n ? [`${n.toLocaleString('en-CA')} ${n === 1 ? one : many}`] : [];
  });
  const trkpts = points.map((p) =>
    p.ele === undefined
      ? `      <trkpt lat="${round(p.lat, 6)}" lon="${round(p.lon, 6)}"/>`
      : `      <trkpt lat="${round(p.lat, 6)}" lon="${round(p.lon, 6)}"><ele>${round(p.ele, 1)}</ele></trkpt>`,
  );
  const gpx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="AnyoneCanPace route editor" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <trk>',
    `    <name>${escapeXml(name.trim())}</name>`,
    '    <trkseg>',
    ...trkpts,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
  return { gpx, points: points.length, removed };
}
