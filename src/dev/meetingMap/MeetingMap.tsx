/**
 * Dev-only (`?meeting-map`): draws the meeting point from src/data/event.json
 * on the app's own offline map (same style and PMTiles file as the Route
 * Library), adds the pin, label and credit, and saves the picture into the
 * repo for the Sunday story (src/assets/story/meeting-map.webp).
 *
 * Re-run it whenever the meeting place or the map file changes; a test fails
 * if the saved picture's coordinates no longer match the event file.
 * main.tsx only loads it when `import.meta.env.DEV`, so it never ships.
 */
import { useEffect, useRef, useState } from 'react';
import { addProtocol, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FetchSource, PMTiles, Protocol } from 'pmtiles';
import { EVENT } from '../../event/event';
import { BRAND, buildStyle } from '../../sixk/map/mapStyle';
import { MAP_VERSION, mapUrl } from '../../sixk/map/offlineMap';

/** Output size (px). The story shows it 960 px wide. */
const OUT = { width: 960, height: 640 } as const;
const PIXEL_RATIO = 2;
const ZOOM = 15.6;
const FONT = '"JetBrains Mono", ui-monospace, monospace';

setWorkerUrl(workerUrl);

// This page only makes a picture, so it must work in a background tab too, where the browser
// sends no animation frames (MapLibre waits for one even to load its style). Timers stand in.
window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => window.clearTimeout(id);

export default function MeetingMap() {
  const box = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState('Drawing the map…');
  const place = EVENT.place;

  useEffect(() => {
    const protocol = new Protocol();
    addProtocol('pmtiles', protocol.tile);
    const key = mapUrl();
    protocol.add(new PMTiles(new FetchSource(key)));
    const glyphs = `${location.origin}${import.meta.env.BASE_URL}maps/fonts/{fontstack}/{range}.pbf`;
    const map = new MapLibreMap({
      container: box.current!,
      style: buildStyle(`pmtiles://${key}`, glyphs),
      center: [place.lon, place.lat],
      zoom: ZOOM,
      pixelRatio: PIXEL_RATIO,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    (window as unknown as { meetingMap?: MapLibreMap }).meetingMap = map; // for poking at in devtools
    map.on('load', () => {
      // The map's own labels get cut at the picture's edges and name sidewalks too:
      // hide them and draw a few chosen street names in `compose` instead.
      map.setLayoutProperty('road-labels', 'visibility', 'none');
    });
    // Wait until every tile is in, forcing redraws ourselves: a background tab never gets
    // animation frames, so MapLibre's own 'idle' may never come there.
    let done = false;
    const timer = window.setInterval(() => {
      if (done || !map.isStyleLoaded()) return;
      map.redraw();
      if (map.loaded() && map.areTilesLoaded()) {
        done = true;
        window.clearInterval(timer);
        map.redraw();
        void capture();
      }
    }, 300);
    const capture = async () => {
      try {
        await document.fonts.load(`700 30px ${FONT}`);
        await document.fonts.load(`700 22px ${FONT}`);
        setImage(compose(map, place.name));
        setStatus('Ready. Check the pin, then save.');
      } catch (err) {
        setStatus(`Failed: ${String(err)}`);
      }
    };
    return () => {
      done = true;
      window.clearInterval(timer);
      map.remove();
    };
  }, [place.lat, place.lon, place.name]);

  async function save() {
    if (!image) return;
    setStatus('Saving…');
    const res = await fetch('/__dev/meeting-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webp: image.replace(/^data:image\/webp;base64,/, ''),
        meta: {
          lat: place.lat,
          lon: place.lon,
          zoom: ZOOM,
          width: OUT.width,
          height: OUT.height,
          mapVersion: MAP_VERSION,
          note: 'Made by ?meeting-map (src/dev/meetingMap). Re-make it when src/data/event.json or the map changes.',
        },
      }),
    });
    setStatus(res.ok ? `Saved: ${(await res.json()).saved.join(', ')}` : `Save failed: ${await res.text()}`);
  }

  return (
    <div style={{ padding: 16, fontFamily: FONT }}>
      <h1 style={{ color: BRAND.navy, margin: '0 0 8px' }}>Meeting-point map</h1>
      <p style={{ margin: '0 0 12px', maxWidth: 640 }}>
        {place.name}: {place.spot}, {place.address} ({place.lat}, {place.lon}). From <code>src/data/event.json</code>.
      </p>
      <div
        ref={box}
        style={{ width: OUT.width / PIXEL_RATIO, height: OUT.height / PIXEL_RATIO, position: 'absolute', left: -9999 }}
      />
      <p role="status">{status}</p>
      {image && (
        <>
          <img src={image} alt={`Map of ${place.name}`} style={{ width: '100%', maxWidth: OUT.width, border: '2px solid' }} />
          <p style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => void save()} style={{ minHeight: 44, font: 'inherit', fontWeight: 700 }}>
              SAVE TO REPO
            </button>
            <a href={image} download="meeting-map.webp" style={{ alignSelf: 'center' }}>
              Download
            </a>
          </p>
        </>
      )}
    </div>
  );
}

/** Streets named on the picture: the map's name → the words shown. */
const STREETS: [string, string][] = [
  ['Rue Sainte-Catherine Ouest', 'Rue Sainte-Catherine'],
  ['Rue Clark', 'Rue Clark'],
  ['Rue Saint-Urbain', 'Rue Saint-Urbain'],
  ['Boulevard De Maisonneuve Ouest', 'Boul. De Maisonneuve'],
  ['Boulevard Saint-Laurent', 'Boul. Saint-Laurent'],
];

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Map + pin at the centre + place label + street names + credit, as a WebP data URL. */
function compose(map: MapLibreMap, label: string): string {
  const c = document.createElement('canvas');
  c.width = OUT.width;
  c.height = OUT.height;
  const g = c.getContext('2d')!;
  g.drawImage(map.getCanvas(), 0, 0, OUT.width, OUT.height);
  const scale = OUT.width / map.getContainer().clientWidth;

  const [x, y] = [OUT.width / 2, OUT.height / 2]; // the pin's tip is the exact spot
  const r = 30;
  const cy = y - 56;

  // Label to the right of the pin head (measured first, so street names avoid it).
  g.font = `700 30px ${FONT}`;
  const tw = g.measureText(label).width;
  const [lx, ly, lh] = [x + r + 18, cy - 26, 52];
  const credit = '© OpenStreetMap contributors · Protomaps';
  g.font = `500 18px ${FONT}`;
  const cw = g.measureText(credit).width;
  const taken: Box[] = [
    { x0: x - r - 10, y0: cy - r - 10, x1: x + r + 10, y1: y + 10 },
    { x0: lx - 10, y0: ly - 10, x1: lx + tw + 42, y1: ly + lh + 10 },
    { x0: OUT.width - cw - 30, y0: OUT.height - 40, x1: OUT.width, y1: OUT.height },
  ];
  drawStreetNames(g, map, scale, taken);

  g.lineJoin = 'round';
  g.beginPath();
  g.arc(x, cy, r, Math.PI * 0.8, Math.PI * 2.2);
  g.lineTo(x, y);
  g.closePath();
  g.fillStyle = BRAND.gold;
  g.strokeStyle = BRAND.asphalt;
  g.lineWidth = 6;
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(x, cy, 11, 0, Math.PI * 2);
  g.fillStyle = BRAND.paper;
  g.fill();
  g.stroke();

  g.font = `700 30px ${FONT}`;
  g.beginPath();
  g.roundRect(lx, ly, tw + 32, lh, 14);
  g.fillStyle = BRAND.paper;
  g.fill();
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = BRAND.navy;
  g.textBaseline = 'middle';
  g.fillText(label, lx + 16, ly + lh / 2 + 1);

  // Credit (OpenStreetMap's licence asks for it on the picture).
  g.font = `500 18px ${FONT}`;
  g.fillStyle = 'rgb(245 240 232 / 0.85)';
  g.fillRect(OUT.width - cw - 20, OUT.height - 32, cw + 20, 32);
  g.fillStyle = BRAND.asphalt;
  g.fillText(credit, OUT.width - cw - 10, OUT.height - 15);

  // WebP: a fraction of the PNG's size, and the app's offline cache downloads it on every phone.
  return c.toDataURL('image/webp', 0.9);
}

/**
 * Each chosen street's name once, along a straight stretch of it, wholly
 * inside the picture and clear of the pin, its label and other names.
 * Prefers spots a little away from the pin so the names frame it.
 */
function drawStreetNames(g: CanvasRenderingContext2D, map: MapLibreMap, scale: number, taken: Box[]) {
  const MARGIN = 14;
  const SIZE = 22;
  g.font = `700 ${SIZE}px ${FONT}`;
  const centre = { x: OUT.width / 2, y: OUT.height / 2 };
  for (const [name, text] of STREETS) {
    const lines = map
      .queryRenderedFeatures({ layers: ['major-roads', 'minor-roads', 'paths'] })
      .filter((f) => f.properties.name === name && !['sidewalk', 'crossing', 'cycleway'].includes(f.properties.kind_detail))
      .flatMap((f): number[][][] =>
        f.geometry.type === 'LineString'
          ? [f.geometry.coordinates]
          : f.geometry.type === 'MultiLineString'
            ? f.geometry.coordinates
            : [],
      );
    const w = g.measureText(text).width + 16;
    const h = SIZE + 10;
    // Downtown streets are straight here: fit one line through all of the street's points
    // (the pieces are split at every crossing and tile edge), then slide the name along it.
    // Only the part inside the picture counts: sample each piece every 8 px and keep what's in frame.
    const pts: { x: number; y: number }[] = [];
    for (const line of lines) {
      const px = line.map(([lon, lat]) => map.project([lon, lat] as [number, number])).map((p) => ({ x: p.x * scale, y: p.y * scale }));
      for (let i = 1; i < px.length; i++) {
        const [a, b] = [px[i - 1], px[i]];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
        for (let k = 0; k <= steps; k++) {
          const p = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
          if (p.x >= 0 && p.x <= OUT.width && p.y >= 0 && p.y <= OUT.height) pts.push(p);
        }
      }
    }
    let best: { score: number; px: number; py: number; angle: number; boxes: Box[] } | null = null;
    if (pts.length >= 2) {
      const mx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
      const my = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
      let [sxx, sxy, syy] = [0, 0, 0];
      for (const p of pts) {
        sxx += (p.x - mx) ** 2;
        sxy += (p.x - mx) * (p.y - my);
        syy += (p.y - my) ** 2;
      }
      let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
      // Only trust the fit if the street really is straight (every point within a few px of the line).
      const off = Math.max(...pts.map((p) => Math.abs(-(p.x - mx) * dy + (p.y - my) * dx)));
      const ts = pts.map((p) => (p.x - mx) * dx + (p.y - my) * dy);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      for (let t = Math.min(...ts) + w / 2; off < 12 && t <= Math.max(...ts) - w / 2; t += 8) {
        const [px, py] = [mx + dx * t, my + dy * t];
        // A slanted label as a chain of small squares along its middle (a tighter fit than one big box).
        const n = Math.ceil(w / h);
        const boxes = Array.from({ length: n }, (_, k) => {
          const u = -w / 2 + (h / 2) + ((w - h) * k) / Math.max(1, n - 1);
          const [bx, by] = [px + dx * u, py + dy * u];
          return { x0: bx - h / 2, y0: by - h / 2, x1: bx + h / 2, y1: by + h / 2 };
        });
        if (boxes.some((b) => b.x0 < MARGIN || b.y0 < MARGIN || b.x1 > OUT.width - MARGIN || b.y1 > OUT.height - MARGIN))
          continue;
        if (boxes.some((b) => taken.some((o) => overlaps(o, b)))) continue;
        const score = Math.abs(Math.hypot(px - centre.x, py - centre.y) - 200);
        if (!best || score < best.score) best = { score, px, py, angle, boxes };
      }
      if (off >= 12) console.warn(`"${text}" isn't straight here (${Math.round(off)} px off): not named`);
    }
    if (!best) {
      console.warn(`No room for "${text}" on the meeting map`);
      continue;
    }
    taken.push(...best.boxes);
    g.save();
    g.translate(best.px, best.py);
    g.rotate(best.angle);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = BRAND.pavement;
    g.strokeText(text, 0, 1);
    g.fillStyle = BRAND.asphalt;
    g.fillText(text, 0, 1);
    g.restore();
  }
}
