/**
 * The Sunday story's layout: a pure list of things to draw on a 1080 × 1920
 * canvas, worked out from a snapshot. Text is JetBrains Mono, which is
 * monospaced (every glyph is 0.6 em wide), so widths are exact here without
 * a canvas, and the tests can check nothing is clipped or covered.
 *
 * Instagram draws its own header over the top of a story and the reply bar
 * over the bottom, so key content stays between SAFE.top and SAFE.bottom.
 */
import type { StorySnapshot } from './snapshot';
import { MONTREAL } from '../weather/forecast';
import { BRAND } from '../sixk/map/mapStyle';
import type { Advice } from '../weather/outfit';

export const STORY = { width: 1080, height: 1920 } as const;
export const SAFE = { top: 220, bottom: 1700, side: 60 } as const;
/** The meeting-map picture's own size (src/assets/story/meeting-map.webp). */
export const MAP_PICTURE = { width: 960, height: 520 } as const;
/** Smallest the map may shrink to before the layout counts as broken (tests). */
export const MIN_MAP_SCALE = 0.75;

const MONO_EM = 0.6;
/** Comic Neue isn't monospaced; this bounds its widest common letters. */
const COMIC_EM = 0.58;

export type Font = 'mono' | 'comic';
export type Role = 'key' | 'decor' | 'footer';

export type Op =
  | { kind: 'rect'; role: Role; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; line?: number; radius?: number }
  | {
      kind: 'text';
      role: Role;
      x: number;
      y: number;
      /** Box the text must stay inside (for tests and alignment). */
      w: number;
      text: string;
      size: number;
      weight: number;
      color: string;
      font: Font;
      align: 'left' | 'center';
    }
  | { kind: 'duck'; role: Role; x: number; y: number; w: number; h: number }
  | { kind: 'effect'; role: Role; x: number; y: number; w: number; h: number; effect: 'rain' | 'snow' }
  | { kind: 'map'; role: Role; x: number; y: number; w: number; h: number; radius: number };

export const textWidth = (text: string, size: number, font: Font = 'mono') =>
  [...text].length * size * (font === 'mono' ? MONO_EM : COMIC_EM);

/** Greedy word wrap to a pixel width. A single word longer than the line stays on its own line. */
export function wrap(text: string, size: number, maxW: number, font: Font = 'mono'): string[] {
  const lines: string[] = [];
  let line = '';
  // Only ordinary spaces break: no-break spaces keep "80 %" and "10 km/h" together.
  for (const word of text.split(/ +/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, font) > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long', month: 'long', day: 'numeric' });
const stampFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit' });
const NB = '\u00a0';
const deg = (c: number) => `${Math.round(c) || 0}${NB}°C`;

/** The one note worth a story: a warning, else a caution, else the first thing to bring, else a weather note (not the rain chance, which the weather lines show). */
export function storyNote(s: StorySnapshot): string | null {
  const a = s.outfit.advisories;
  const pick = (level: Advice['level']) => a.find((x) => x.level === level);
  const serious = pick('warning') ?? pick('caution');
  if (serious) return serious.level === 'warning' ? `Warning: ${serious.text}` : serious.text;
  if (s.outfit.bring[0]) return `Bring: ${s.outfit.bring[0].charAt(0).toLowerCase()}${s.outfit.bring[0].slice(1)}`;
  // The chance of rain is already in the weather lines.
  return a.find((x) => x.level === 'info' && !/% chance of rain or snow/.test(x.text))?.text ?? null;
}

export function storyLayout(s: StorySnapshot): Op[] {
  const ops: Op[] = [];
  const W = STORY.width;
  const x0 = SAFE.side;
  const inner = W - 2 * SAFE.side;
  const text = (
    t: string,
    y: number,
    size: number,
    o: Partial<Extract<Op, { kind: 'text' }>> = {},
  ): Extract<Op, { kind: 'text' }> => ({
    kind: 'text',
    role: 'key',
    x: x0,
    y,
    w: inner,
    text: t,
    size,
    weight: 700,
    color: BRAND.asphalt,
    font: 'mono',
    align: 'left',
    ...o,
  });
  /** Wrapped lines from y; returns the y below them. */
  const lines = (t: string, y: number, size: number, lh: number, o: Partial<Extract<Op, { kind: 'text' }>> = {}) => {
    const w = o.w ?? inner;
    for (const l of wrap(t, size, w, o.font)) {
      ops.push(text(l, y, size, o));
      y += lh;
    }
    return y;
  };

  // Background and brand bands (decor; Instagram's header and reply bar sit over them).
  ops.push({ kind: 'rect', role: 'decor', x: 0, y: 0, w: W, h: STORY.height, fill: BRAND.pavement });
  ops.push({ kind: 'rect', role: 'decor', x: 0, y: 0, w: W, h: 190, fill: BRAND.navy });
  ops.push({ kind: 'rect', role: 'decor', x: 0, y: 190, w: W, h: 12, fill: BRAND.gold });
  ops.push({ kind: 'rect', role: 'decor', x: 0, y: 1718, w: W, h: 12, fill: BRAND.gold });
  ops.push({ kind: 'rect', role: 'decor', x: 0, y: 1730, w: W, h: STORY.height - 1730, fill: BRAND.navy });

  // Headline, date and times.
  let y = 240;
  ops.push(text(`SEE YOU ${s.weekday.toUpperCase()}!`, y, 92, { weight: 800, color: BRAND.navy, align: 'center' }));
  y += 112;
  y = lines(`${dateFmt.format(s.run.startAt)} · meet ${hhmm(s.run.meetAt)}, run ${hhmm(s.run.startAt)}`, y, 34, 44, {
    align: 'center',
  });
  y += 16;

  // Duck card and the weather beside it.
  const card = 330;
  ops.push({ kind: 'rect', role: 'key', x: x0, y, w: card, h: card, fill: '#EDE5D8', stroke: BRAND.asphalt, line: 5, radius: 28 });
  if (s.outfit.effect) ops.push({ kind: 'effect', role: 'decor', x: x0, y, w: card, h: card, effect: s.outfit.effect });
  ops.push({ kind: 'duck', role: 'key', x: x0 + 10, y: y + 10, w: card - 20, h: card - 20 });
  const cx = x0 + card + 30;
  const cw = W - SAFE.side - cx;
  const bubble = 'Dress like me!';
  const bw = textWidth(bubble, 36, 'comic') + 40;
  ops.push({ kind: 'rect', role: 'key', x: cx, y, w: bw, h: 62, fill: BRAND.paper, stroke: BRAND.asphalt, line: 4, radius: 22 });
  ops.push(text(bubble, y + 13, 36, { x: cx + 20, w: bw - 40, font: 'comic', color: BRAND.navy }));
  // No space before the unit at this size: a monospaced space is wide.
  ops.push(text(`${Math.round(s.weather.tempC) || 0}°C`, y + 78, 116, { x: cx, w: cw, weight: 800, color: BRAND.navy }));
  ops.push(text(s.weather.text, y + 220, 36, { x: cx, w: cw }));
  const wind = s.weather.windKmh !== null ? `${NB}· wind ${Math.round(s.weather.windKmh)}${NB}km/h` : '';
  const wet =
    s.weather.precipProb !== null && s.weather.precipProb >= 40 ? `${NB}· ${Math.round(s.weather.precipProb)}${NB}% rain/snow` : '';
  lines(`Feels like ${deg(s.weather.feelsC)}${wind}${wet}`, y + 266, 26, 32, { x: cx, w: cw, weight: 500 });
  y += card + 26;

  // What to wear: the same labels as the website, in the same order.
  ops.push(text('WHAT TO WEAR', y, 28, { weight: 800, color: BRAND.navy }));
  y += 40;
  // A "·" never starts a line: it sticks to the word before it.
  y = lines(s.outfit.wear.map((i) => i.label).join(`${NB}· `), y, 36, 46);
  y += 14;

  const note = storyNote(s);
  if (note) {
    const tl = wrap(note, 27, inner - 44);
    const h = tl.length * 36 + 26;
    ops.push({ kind: 'rect', role: 'key', x: x0, y, w: inner, h, fill: BRAND.paper, stroke: BRAND.asphalt, line: 3, radius: 16 });
    ops.push({ kind: 'rect', role: 'key', x: x0, y, w: 12, h, fill: note.startsWith('Warning') ? BRAND.asphalt : BRAND.gold, radius: 6 });
    lines(note, y + 13, 27, 36, { x: x0 + 30, w: inner - 44, weight: 600 });
    y += h;
  }
  y += 22;

  // Meeting point: map, then place, then the welcome. The map takes what's left.
  const caption = `${s.place.name} · ${s.place.spot.toLowerCase()}, ${s.place.address}`;
  const captionLines = wrap(caption, 26, inner).length;
  const welcome = ["New here? You're welcome!", 'Run/walk friendly · Nobody left behind.'];
  const tail = 10 + captionLines * 34 + 18 + welcome.length * 38 + 20;
  const scale = Math.min(1, (SAFE.bottom - y - tail) / MAP_PICTURE.height);
  const mw = MAP_PICTURE.width * scale;
  const mh = MAP_PICTURE.height * scale;
  ops.push({ kind: 'map', role: 'key', x: (W - mw) / 2, y, w: mw, h: mh, radius: 22 });
  ops.push({ kind: 'rect', role: 'key', x: (W - mw) / 2, y, w: mw, h: mh, stroke: BRAND.asphalt, line: 5, radius: 22 });
  y += mh + 10;
  y = lines(caption, y, 26, 34, { weight: 600, align: 'center' });
  y += 18;
  const pillH = welcome.length * 38 + 20;
  ops.push({ kind: 'rect', role: 'key', x: x0, y, w: inner, h: pillH, fill: BRAND.navy, radius: pillH / 2 });
  welcome.forEach((l, i) => ops.push(text(l, y + 12 + i * 38, 28, { align: 'center', color: BRAND.paper, weight: 800 })));

  // Footer (under the reply bar is fine: nice to have, not needed).
  ops.push(text('LES STOOOPIDS · ANYONECANPACE', 1760, 30, { role: 'footer', align: 'center', color: BRAND.pavement, weight: 800 }));
  const stamp = `Forecast from ${stampFmt.format(s.forecastFetchedAt)} · Open-Meteo / ECCC GEM (CC BY 4.0) · Map © OpenStreetMap contributors`;
  wrap(stamp, 18, inner).forEach((l, i) =>
    ops.push(text(l, 1810 + i * 26, 18, { role: 'footer', align: 'center', color: BRAND.pavement, weight: 500 })),
  );

  return ops;
}

const hhmmFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "10:15" in Montréal time. */
const hhmm = (at: number) => hhmmFmt.format(at);
