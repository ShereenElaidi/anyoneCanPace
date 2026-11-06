import { describe, expect, it } from 'vitest';
import { parseGpx } from './process-route.ts';
import { sanitizeGpx } from './sanitize-gpx.ts';

// Shaped like a watch export: metadata, a waypoint, timestamps and Garmin's heart-rate/cadence extensions.
const WATCH_EXPORT = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Garmin Connect" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>Jane's morning run</name><author><name>Jane Doe</name></author><time>2026-11-01T11:02:03Z</time></metadata>
  <wpt lat="45.5000" lon="-73.6000"><name>Home</name></wpt>
  <trk>
    <name>Morning Run from home</name>
    <desc>Easy 6K</desc>
    <trkseg>
      <trkpt lat="45.47912345" lon="-73.58123456"><ele>21.43</ele><time>2026-11-01T11:02:03Z</time>
        <extensions><ns3:TrackPointExtension><ns3:hr>132</ns3:hr><ns3:cad>84</ns3:cad></ns3:TrackPointExtension></extensions></trkpt>
      <trkpt lat="45.47950000" lon="-73.58050000"><ele>22.0</ele><time>2026-11-01T11:02:09Z</time>
        <extensions><ns3:TrackPointExtension><ns3:hr>135</ns3:hr><ns3:cad>85</ns3:cad></ns3:TrackPointExtension></extensions></trkpt>
      <trkpt lat="45.48" lon="-73.58"><ele>22.6</ele><time>2026-11-01T11:02:15Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe('sanitizeGpx', () => {
  it('keeps only the track points and the given name', () => {
    const { gpx, points } = sanitizeGpx(WATCH_EXPORT, 'Canal & Market');
    expect(points).toBe(3);
    for (const gone of ['<time', 'hr>', 'cad>', '<extensions', '<metadata', '<wpt', 'Jane', 'Home', 'Morning Run', 'Easy 6K', 'Garmin']) {
      expect(gpx, gone).not.toContain(gone);
    }
    expect(gpx).toContain('<name>Canal &amp; Market</name>');
    expect(gpx).toContain('<trkpt lat="45.479123" lon="-73.581235"><ele>21.4</ele></trkpt>');
  });

  it('the route build reads the cleaned file the same way (coordinates to 6 decimals)', () => {
    const before = parseGpx(WATCH_EXPORT).points;
    const after = parseGpx(sanitizeGpx(WATCH_EXPORT, 'x').gpx).points;
    expect(after).toHaveLength(before.length);
    after.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(before[i].lat, 6);
      expect(p.lon).toBeCloseTo(before[i].lon, 6);
      expect(p.ele).toBeCloseTo(before[i].ele!, 1);
    });
  });

  it('says what it removed', () => {
    expect(sanitizeGpx(WATCH_EXPORT, 'x').removed).toEqual([
      '4 timestamps',
      '2 heart-rate readings',
      '2 cadence readings',
      '2 blocks of device extensions',
      '1 waypoint',
      '1 metadata block (author, device, links)',
      '4 names',
      '1 description or comment',
    ]);
  });

  it('turns route points into track points, with or without elevation', () => {
    const drawn = '<gpx><rte><rtept lat="45.1" lon="-73.1"/><rtept lat="45.2" lon="-73.2"/></rte></gpx>';
    const { gpx, removed } = sanitizeGpx(drawn, 'Drawn');
    expect(gpx).toContain('<trkpt lat="45.1" lon="-73.1"/>');
    expect(gpx).toContain('<trkpt lat="45.2" lon="-73.2"/>');
    expect(removed).toEqual([]);
  });

  it('a cleaned file is already clean', () => {
    const once = sanitizeGpx(WATCH_EXPORT, 'Canal').gpx;
    const twice = sanitizeGpx(once, 'Canal');
    expect(twice.gpx).toBe(once);
    expect(twice.removed).toEqual(['1 name']);
  });

  it('rejects a file without a track', () => {
    expect(() => sanitizeGpx('<gpx><wpt lat="45" lon="-73"/></gpx>', 'x')).toThrow(/no track/);
  });
});
