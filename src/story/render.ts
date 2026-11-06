/**
 * Draws a story snapshot to a 1080 × 1920 PNG with the Canvas API (no
 * libraries). Loaded on demand from the dashboard's MAKE STORY.
 *
 * - Fonts are loaded before drawing (JetBrains Mono from the app's CSS,
 *   Comic Neue for the duck's bubble).
 * - The duck is `duckImages(outfit.drawn)`, the same list the website stacks.
 * - Every image is same-origin and decoded first, so the canvas is never
 *   tainted and toBlob always works.
 */
import comicUrl from '../assets/fonts/comic-neue-latin-700-normal.woff2';
import mapUrl from '../assets/story/meeting-map.webp';
import { duckImages } from '../dashboard/duck/art';
import { BRAND } from '../sixk/map/mapStyle';
import { STORY, storyLayout, type Op } from './layout';
import type { StorySnapshot } from './snapshot';

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
  roundRect(g, o.x, o.y, o.w, o.h, 28);
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

/** The story as a PNG. Throws if a font or picture can't load. */
export async function renderStory(s: StorySnapshot): Promise<Blob> {
  const ops = storyLayout(s);
  const [, map, ...duck] = await Promise.all([
    loadFonts(),
    loadImage(mapUrl),
    ...duckImages(s.outfit.drawn).map((d) => loadImage(d.url)),
  ]);

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
      case 'text':
        g.font = `${o.weight} ${o.size}px ${o.font === 'comic' ? COMIC : MONO}`;
        g.fillStyle = o.color;
        g.textAlign = o.align;
        g.fillText(o.text, o.align === 'center' ? o.x + o.w / 2 : o.x, o.y);
        break;
      case 'effect':
        drawEffect(g, o);
        break;
      case 'duck':
        for (const img of duck) g.drawImage(img, o.x, o.y, o.w, o.h);
        break;
      case 'map':
        g.save();
        roundRect(g, o.x, o.y, o.w, o.h, o.radius);
        g.clip();
        g.drawImage(map, o.x, o.y, o.w, o.h);
        g.restore();
        break;
    }
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t make the picture'))), 'image/png'),
  );
}
