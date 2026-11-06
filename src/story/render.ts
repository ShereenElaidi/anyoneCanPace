/**
 * Draws a story snapshot as two 1080 × 1920 PNGs (the poster, then the map)
 * with the Canvas API (no
 * libraries). Loaded on demand from the dashboard's MAKE STORY.
 *
 * - Fonts are loaded before drawing (JetBrains Mono from the app's CSS,
 *   Comic Neue for the duck's bubble).
 * - The duck is `duckImages(outfit.drawn)`, the same list the website stacks.
 * - Every image is same-origin and decoded first, so the canvas is never
 *   tainted and toBlob always works.
 */
import comicUrl from '../assets/fonts/comic-neue-latin-700-normal.woff2';
import skyUrl from '../assets/home/sky.webp';
import mapUrl from '../assets/story/meeting-map.webp';
import photoUrl from '../assets/story/meeting-photo.webp';
import { duckImages } from '../dashboard/duck/art';
import { BRAND } from '../sixk/map/mapStyle';
import { STORY, storyPages, type Op } from './layout';
import type { StorySnapshot } from './snapshot';

/** The sky picture is drawn this tall, centred, its sides cropped (the home screen's sizing). */
const SKY_HEIGHT = 1300;
/** Graph paper: the app's own 10 px grid, doubled for a 1080 px canvas. */
const GRID = 20;

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const COMIC = '"Comic Neue Story", "Comic Neue", "Comic Sans MS", cursive';

let comicReady: Promise<void> | null = null;
function loadComic(): Promise<void> {
  comicReady ??= (async () => {
    const face = new FontFace('Comic Neue Story', `url(${comicUrl})`, { weight: '700' });
    await face.load();
    document.fonts.add(face);
  })();
  return comicReady;
}

async function loadFonts() {
  await Promise.all([
    ...[500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px ${MONO}`, 'SEE YOU °C · é')),
    loadComic(),
  ]);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().then(() => resolve(img), () => resolve(img)) : resolve(img));
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 0) {
  g.beginPath();
  if (r > 0) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

/** A few raindrops or snowflakes, always in the same places. */
function drawEffect(g: CanvasRenderingContext2D, o: Extract<Op, { kind: 'effect' }>) {
  g.save();
  roundRect(g, o.x, o.y, o.w, o.h, o.radius);
  g.clip();
  for (let i = 0; i < 26; i++) {
    const x = o.x + ((i * 73) % 100) / 100 * o.w;
    const y = o.y + ((i * 37 + 11) % 100) / 100 * o.h;
    if (o.effect === 'rain') {
      g.strokeStyle = BRAND.blue;
      g.globalAlpha = 0.7;
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 5, y + 26);
      g.stroke();
    } else {
      g.globalAlpha = 1;
      g.fillStyle = BRAND.paper;
      g.strokeStyle = 'rgb(44 44 42 / 0.4)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
  g.restore();
}

/** Pavement, graph paper, then the sunset sky on top (its bottom fades out, so the paper shows below it). */
function drawBackdrop(g: CanvasRenderingContext2D, o: Extract<Op, { kind: 'backdrop' }>, sky: HTMLImageElement) {
  g.fillStyle = BRAND.pavement;
  g.fillRect(o.x, o.y, o.w, o.h);
  g.fillStyle = 'rgb(55 138 221 / 0.09)';
  for (let x = 0; x < o.w; x += GRID) g.fillRect(o.x + x, o.y, 2, o.h);
  for (let y = 0; y < o.h; y += GRID) g.fillRect(o.x, o.y + y, o.w, 2);
  const w = (sky.naturalWidth / sky.naturalHeight) * SKY_HEIGHT;
  g.drawImage(sky, o.x + (o.w - w) / 2, o.y, w, SKY_HEIGHT);
}

/** The story's pages as PNGs, in posting order. Throws if a font or picture can't load. */
export async function renderStory(s: StorySnapshot): Promise<Blob[]> {
  const [, sky, map, photo, ...duck] = await Promise.all([
    loadFonts(),
    loadImage(skyUrl),
    loadImage(mapUrl),
    loadImage(photoUrl),
    ...duckImages(s.outfit.drawn).map((d) => loadImage(d.url)),
  ]);
  return Promise.all(storyPages(s).map((ops) => draw(ops, { sky, map, photo }, duck)));
}

function draw(ops: Op[], pictures: { sky: HTMLImageElement; map: HTMLImageElement; photo: HTMLImageElement }, duck: HTMLImageElement[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = STORY.width;
  canvas.height = STORY.height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('No 2D canvas');
  g.textBaseline = 'top';

  for (const o of ops) {
    switch (o.kind) {
      case 'rect':
        roundRect(g, o.x, o.y, o.w, o.h, o.radius);
        if (o.fill) {
          g.fillStyle = o.fill;
          g.fill();
        }
        if (o.stroke) {
          g.strokeStyle = o.stroke;
          g.lineWidth = o.line ?? 2;
          g.stroke();
        }
        break;
      case 'poly':
        g.beginPath();
        o.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fillStyle = o.fill;
        g.fill();
        if (o.stroke) {
          g.strokeStyle = o.stroke;
          g.lineWidth = o.line ?? 2;
          g.lineJoin = 'round';
          g.stroke();
        }
        break;
      case 'backdrop':
        drawBackdrop(g, o, pictures.sky);
        break;
      case 'text': {
        g.font = `${o.weight} ${o.size}px ${o.font === 'comic' ? COMIC : MONO}`;
        g.textAlign = o.align;
        const tx = o.align === 'center' ? o.x + o.w / 2 : o.x;
        if (o.outline) {
          // Stroke first, then the fill over it, so the letters stay full width.
          g.strokeStyle = o.outline;
          g.lineWidth = Math.round(o.size / 7);
          g.lineJoin = 'round';
          g.strokeText(o.text, tx, o.y);
        }
        g.fillStyle = o.color;
        g.fillText(o.text, tx, o.y);
        break;
      }
      case 'effect':
        drawEffect(g, o);
        break;
      case 'duck':
        for (const img of duck) g.drawImage(img, o.x, o.y, o.w, o.h);
        break;
      case 'map':
      case 'photo':
        g.save();
        roundRect(g, o.x, o.y, o.w, o.h, o.radius);
        g.clip();
        g.drawImage(pictures[o.kind], o.x, o.y, o.w, o.h);
        g.restore();
        break;
    }
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t make the picture'))), 'image/png'),
  );
}
