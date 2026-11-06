/**
 * The Sunday story's layout: a pure list of things to draw on a 1080 × 1920
 * canvas, worked out from a snapshot. Text is JetBrains Mono, which is
 * monospaced (every glyph is 0.6 em wide), so widths are exact here without
 * a canvas, and the tests can check nothing is clipped or covered.
 *
 * Two pages, posted one after the other:
 * 1. the poster: the dressed duck big, the weather on a sticker beside it,
 *    what to wear, the most important note and a welcome;
 * 2. the map: "Lost? Find your Flock!", where and when, the meeting-point
 *    map, the photo of the spot, and empty space for Instagram's Link sticker.
 *
 * Instagram draws its own header over the top of a story and the reply bar
 * over the bottom, so key content stays between SAFE.top and SAFE.bottom.
 */
import type { StorySnapshot } from './snapshot';
import { MONTREAL } from '../weather/forecast';
import { BRAND } from '../sixk/map/mapStyle';
import type { Advice } from '../weather/outfit';
import { extrasText, layersText } from '../weather/outfitText';

export const STORY = { width: 1080, height: 1920 } as const;
export const SAFE = { top: 220, bottom: 1700, side: 60 } as const;
/** The meeting-map picture's own size (src/assets/story/meeting-map.webp). */
export const MAP_PICTURE = { width: 960, height: 520 } as const;
/** The meeting-point photo's shape (src/assets/story/meeting-photo.webp, 1280 × 720). */
export const PHOTO = { width: 960, height: 540 } as const;
/** The map and photo shrink together to fit the page, never below this (tests). */
export const MIN_PICTURE_SCALE = 0.8;
/** The duck's circle on the poster: as big as the outfit text leaves room for. */
export const DUCK = { max: 700, min: 380 } as const;
/** The weather sticker's width beside a big duck (it may overlap the circle's edge). */
const STICKER_W = 300;
/** The outfit line: big when it fits on one line, else smaller and wrapped. */
const WEAR = { big: 66, small: 52 } as const;
/** The welcome pill's text size: big when the duck still gets DUCK.max, else small. */
export const WELCOME = { big: 32, small: 28 } as const;

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
  | { kind: 'effect'; role: Role; x: number; y: number; w: number; h: number; radius: number; effect: 'rain' | 'snow' }
  /** A filled outline, e.g. the speech bubble's tail. */
  | { kind: 'poly'; role: Role; points: [number, number][]; fill: string; stroke?: string; line?: number }
  | { kind: 'map'; role: Role; x: number; y: number; w: number; h: number; radius: number }
  /** The photo of the meeting point (src/assets/story/meeting-photo.webp). */
  | { kind: 'photo'; role: Role; x: number; y: number; w: number; h: number; radius: number };

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

type TextOp = Extract<Op, { kind: 'text' }>;

/** Drawing helpers for one page: text with defaults, wrapped lines, the brand bands and footer. */
function page() {
  const ops: Op[] = [];
  const x0 = SAFE.side;
  const inner = STORY.width - 2 * SAFE.side;
  const text = (t: string, y: number, size: number, o: Partial<TextOp> = {}): TextOp => ({
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
  const lines = (t: string, y: number, size: number, lh: number, o: Partial<TextOp> = {}) => {
    for (const l of wrap(t, size, o.w ?? inner, o.font)) {
      ops.push(text(l, y, size, o));
      y += lh;
    }
    return y;
  };
  /** Background and brand bands (decor; Instagram's header and reply bar sit over them), and the footer. */
  const frame = (credits: string) => {
    const W = STORY.width;
    ops.push({ kind: 'rect', role: 'decor', x: 0, y: 0, w: W, h: STORY.height, fill: BRAND.pavement });
    ops.push({ kind: 'rect', role: 'decor', x: 0, y: 0, w: W, h: 190, fill: BRAND.navy });
    ops.push({ kind: 'rect', role: 'decor', x: 0, y: 190, w: W, h: 12, fill: BRAND.gold });
    ops.push({ kind: 'rect', role: 'decor', x: 0, y: 1718, w: W, h: 12, fill: BRAND.gold });
    ops.push({ kind: 'rect', role: 'decor', x: 0, y: 1730, w: W, h: STORY.height - 1730, fill: BRAND.navy });
    // Under the reply bar is fine: nice to have, not needed.
    ops.push(text('Stooopid Run Crew', 1760, 30, { role: 'footer', align: 'center', color: BRAND.pavement, weight: 800 }));
    wrap(credits, 18, inner).forEach((l, i) =>
      ops.push(text(l, 1810 + i * 26, 18, { role: 'footer', align: 'center', color: BRAND.pavement, weight: 500 })),
    );
  };
  return { ops, x0, inner, text, lines, frame };
}

/** Both pages, in posting order. */
export const storyPages = (s: StorySnapshot): Op[][] => [storyLayout(s), mapPageLayout(s)];

/** Page 1: the poster. */
export function storyLayout(s: StorySnapshot): Op[] {
  const { ops, x0, inner, text, lines, frame } = page();
  const W = STORY.width;
  frame(`Forecast from ${stampFmt.format(s.forecastFetchedAt)} · Open-Meteo / ECCC GEM (CC BY 4.0)`);

  // Headline, date and times.
  ops.push(text(`SEE YOU ${s.weekday.toUpperCase()}!`, 240, 92, { weight: 800, color: BRAND.navy, align: 'center' }));
  let y = lines(`${dateFmt.format(s.run.startAt)} · meet ${hhmm(s.run.meetAt)}, run ${hhmm(s.run.startAt)}`, 352, 34, 44, {
    align: 'center',
  });
  // Room above the bubble for its (Beta) tag, which sticks out over the top.
  const heroTop = y + 52;

  // From the bottom up: the welcome, the pointer to the map page, then the outfit words.
  const welcome = ["New here? You're welcome!", 'Run/walk friendly · No experience required.'];
  const meet = `Meet at ${s.place.name}: map on the next page`;
  const meetLines = wrap(meet, 30, inner);

  const layers = layersText(s.outfit);
  const wearSize = wrap(layers, WEAR.big, inner).length === 1 ? WEAR.big : WEAR.small;
  const layerLines = wrap(layers, wearSize, inner).length;
  const extras = extrasText(s.outfit);
  const also = extras ? `Also: ${extras}` : '';
  const alsoLines = also ? wrap(also, 34, inner).length : 0;
  const note = storyNote(s);
  const noteLines = note ? wrap(note, 28, inner - 44) : [];
  const noteH = note ? noteLines.length * 38 + 26 : 0;
  const wearH = layerLines * (wearSize + 10) + (also ? 10 + alsoLines * 44 : 0) + (note ? 20 + noteH : 0);

  // The duck takes what's left (the speech bubble sits above it). The welcome is
  // bigger when that still leaves the duck its full size, for balance.
  const bubbleH = 80;
  const pillFor = (size: number) => welcome.length * (size + 10) + 22;
  const roomFor = (size: number) => SAFE.bottom - pillFor(size) - 24 - meetLines.length * 40 - 30 - wearH - 24 - (heroTop + bubbleH);
  const welcomeSize = roomFor(WELCOME.big) >= DUCK.max ? WELCOME.big : WELCOME.small;
  const pillH = pillFor(welcomeSize);
  const pillY = SAFE.bottom - pillH;
  const meetY = pillY - 24 - meetLines.length * 40;
  const room = roomFor(welcomeSize);
  const d = Math.max(DUCK.min, Math.min(DUCK.max, room));
  // Short outfits leave room to spare: half above the duck, half below the words.
  const top = heroTop + Math.max(0, room - d) / 2;
  const duckY = top + bubbleH;
  ops.push({ kind: 'rect', role: 'key', x: x0, y: duckY, w: d, h: d, fill: '#EDE5D8', stroke: BRAND.asphalt, line: 5, radius: d / 2 });
  if (s.outfit.effect) ops.push({ kind: 'effect', role: 'decor', x: x0, y: duckY, w: d, h: d, radius: d / 2, effect: s.outfit.effect });
  const pad = d * 0.07;
  ops.push({ kind: 'duck', role: 'key', x: x0 + pad, y: duckY + pad, w: d - 2 * pad, h: d - 2 * pad });

  // "Dress like me!" in a comic speech bubble, its tail pointing down at the duck's head, tagged (Beta).
  const bubble = 'Dress like me!';
  const bw = textWidth(bubble, 46, 'comic') + 40;
  const bx = x0 + d * 0.42;
  ops.push({ kind: 'rect', role: 'key', x: bx, y: top, w: bw, h: bubbleH - 8, fill: BRAND.paper, stroke: BRAND.asphalt, line: 5, radius: 30 });
  ops.push({
    kind: 'poly',
    role: 'decor',
    points: [
      [bx + 44, top + bubbleH - 13],
      [bx + 84, top + bubbleH - 13],
      [bx + 30, top + bubbleH + 26],
    ],
    fill: BRAND.paper,
    stroke: BRAND.asphalt,
    line: 5,
  });
  // "(Beta)" on a small gold tag at the bubble's corner, in the app's own font.
  const beta = '(Beta)';
  const tw = textWidth(beta, 26) + 24;
  const tx = bx + bw - tw + 18;
  ops.push({ kind: 'rect', role: 'key', x: tx, y: top - 30, w: tw, h: 40, fill: BRAND.gold, stroke: BRAND.asphalt, line: 4, radius: 20 });
  ops.push(text(beta, top - 23, 26, { x: tx + 12, w: tw - 24, weight: 800 }));
  // Covers the stroke where the tail joins the bubble.
  ops.push({ kind: 'rect', role: 'decor', x: bx + 47, y: top + bubbleH - 17, w: 34, h: 8, fill: BRAND.paper });
  // Centred: Comic Neue is narrower than the width allowed for it.
  ops.push(text(bubble, top + 14, 46, { x: bx + 20, w: bw - 40, font: 'comic', color: BRAND.navy, align: 'center' }));

  // The weather on a sticker beside the duck: air temperature big, then feels-like, sky, wind and wet.
  // A big duck leaves too little beside it: the sticker then overlaps the circle's edge (never the duck itself).
  const sx = Math.min(x0 + d + 30, W - SAFE.side - STICKER_W);
  const sw = W - SAFE.side - sx;
  const temp = `${Math.round(s.weather.tempC) || 0}°C`;
  const tSize = Math.min(110, Math.floor((sw - 32) / ([...temp].length * MONO_EM)));
  const facts = [`feels ${deg(s.weather.feelsC)}`, s.weather.text];
  if (s.weather.windKmh !== null && s.weather.windKmh >= 20) facts.push(`wind ${Math.round(s.weather.windKmh)}${NB}km/h`);
  if (s.weather.precipProb !== null && s.weather.precipProb >= 40) facts.push(`${Math.round(s.weather.precipProb)}${NB}% rain/snow`);
  const factLines = facts.flatMap((f) => wrap(f, 28, sw - 32));
  const sh = 24 + tSize * 1.15 + factLines.length * 36 + 18;
  const sy = Math.max(top + bubbleH + 20, duckY + d / 2 - sh / 2);
  ops.push({ kind: 'rect', role: 'key', x: sx, y: sy, w: sw, h: sh, fill: BRAND.paper, stroke: BRAND.asphalt, line: 5, radius: 26 });
  ops.push(text(temp, sy + 20, tSize, { x: sx + 16, w: sw - 32, weight: 800, color: BRAND.navy, align: 'center' }));
  factLines.forEach((l, i) =>
    ops.push(text(l, sy + 24 + tSize * 1.15 + i * 36, 28, { x: sx + 16, w: sw - 32, weight: 600, align: 'center' })),
  );

  // What to wear: the layers big, the rest under them, then the one note.
  y = duckY + d + 24;
  y = lines(layers, y, wearSize, wearSize + 10, { weight: 800, color: BRAND.navy, align: 'center' });
  if (also) y = lines(also, y + 10, 34, 44, { weight: 600, align: 'center' });
  if (note) {
    y += 20;
    ops.push({ kind: 'rect', role: 'key', x: x0, y, w: inner, h: noteH, fill: BRAND.paper, stroke: BRAND.asphalt, line: 3, radius: 16 });
    ops.push({ kind: 'rect', role: 'key', x: x0, y, w: 12, h: noteH, fill: note.startsWith('Warning') ? BRAND.asphalt : BRAND.gold, radius: 6 });
    noteLines.forEach((l, i) => ops.push(text(l, y + 13 + i * 38, 28, { x: x0 + 30, w: inner - 44, weight: 600 })));
  }

  meetLines.forEach((l, i) => ops.push(text(l, meetY + i * 40, 30, { align: 'center', weight: 600 })));
  ops.push({ kind: 'rect', role: 'key', x: x0, y: pillY, w: inner, h: pillH, fill: BRAND.navy, radius: pillH / 2 });
  welcome.forEach((l, i) =>
    // Kept clear of the pill's rounded ends.
    ops.push(text(l, pillY + 12 + i * (welcomeSize + 10), welcomeSize, { x: x0 + 40, w: inner - 80, align: 'center', color: BRAND.paper, weight: 800 })),
  );
  return ops;
}

/** Empty height kept at the bottom of the map page for Instagram's Link sticker (tests). */
export const STICKER_SPACE_MIN = 120;

/** Page 2: where to find us, as a map and a photo. */
export function mapPageLayout(s: StorySnapshot): Op[] {
  const { ops, text, lines, frame } = page();
  frame('Map © OpenStreetMap contributors · Protomaps');

  ops.push(text('Lost? Find your Flock!', 240, 72, { weight: 800, color: BRAND.navy, align: 'center' }));
  let y = 348;
  ops.push(text(s.place.name, y, 44, { weight: 800, color: BRAND.navy, align: 'center' }));
  y = lines(`${s.place.spot}, ${s.place.address}`, y + 60, 30, 38, { weight: 500, align: 'center' });
  y = lines(`${dateFmt.format(s.run.startAt)} · meet ${hhmm(s.run.meetAt)}, run ${hhmm(s.run.startAt)}`, y + 8, 28, 36, {
    weight: 700,
    align: 'center',
  });
  y += 24;

  // The map, then the photo, the same width, as big as fits above the sticker space.
  const gap = 24;
  const k = Math.min(1, (SAFE.bottom - STICKER_SPACE_MIN - y - gap) / (MAP_PICTURE.height + PHOTO.height));
  const w = MAP_PICTURE.width * k;
  const x = (STORY.width - w) / 2;
  const mh = MAP_PICTURE.height * k;
  ops.push({ kind: 'map', role: 'key', x, y, w, h: mh, radius: 22 });
  ops.push({ kind: 'rect', role: 'key', x, y, w, h: mh, stroke: BRAND.asphalt, line: 5, radius: 22 });
  y += mh + gap;
  const ph = PHOTO.height * k;
  ops.push({ kind: 'photo', role: 'key', x, y, w, h: ph, radius: 22 });
  ops.push({ kind: 'rect', role: 'key', x, y, w, h: ph, stroke: BRAND.asphalt, line: 5, radius: 22 });
  // Labelled like the map's place name: a white tag with a dark outline, in a corner.
  const label = 'View from Rue St. Catherine.';
  const lw = textWidth(label, 28) + 28;
  const ly = y + ph - 18 - 46;
  ops.push({ kind: 'rect', role: 'key', x: x + 18, y: ly, w: lw, h: 46, fill: BRAND.paper, stroke: BRAND.asphalt, line: 4, radius: 14 });
  ops.push(text(label, ly + 9, 28, { x: x + 32, w: lw - 28, weight: 700, color: BRAND.navy }));
  // Below the photo stays empty for the Link sticker.
  return ops;
}

const hhmmFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "10:15" in Montréal time. */
const hhmm = (at: number) => hhmmFmt.format(at);
