import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { whatToWear, type ItemId, type OutfitInput } from '../../weather/outfit';
import { DressedDuck } from './DressedDuck';
import { duckImages } from './art';
import { duckLayers, LAYER_ORDER } from './pieces';

const pieceFiles = Object.keys(
  import.meta.glob(['../../assets/duck-outfit/*.webp', '!../../assets/duck-outfit/duck-base.webp']),
).map((p) => p.replace(/^.*\/(.+)\.webp$/, '$1'));

const base = (tempC: number, o: Partial<OutfitInput> = {}): OutfitInput => ({
  tempC,
  feelsC: tempC,
  dewPointC: null,
  precipProb: 0,
  rainMm: 0,
  snowCm: 0,
  precipMm: 0,
  snowDepthM: 0,
  code: 3,
  windKmh: 5,
  gustKmh: 10,
  light: 'day',
  recent: null,
  ...o,
});

describe('dressed duck pieces', () => {
  it('every piece the outfit can draw has a file and a place in the stack', () => {
    const drawn = new Set<ItemId>();
    for (let t = -30; t <= 32; t += 1) {
      for (const extra of [{}, { windKmh: 30 }, { code: 63, rainMm: 2 }, { code: 73, snowCm: 1 }, { light: 'dark' as const }]) {
        whatToWear(base(t, extra)).drawn.forEach((id) => drawn.add(id));
      }
    }
    expect([...drawn].filter((id) => !pieceFiles.includes(id))).toEqual([]);
    expect([...drawn].filter((id) => !LAYER_ORDER.includes(id))).toEqual([]);
    expect(pieceFiles.filter((f) => !LAYER_ORDER.includes(f as ItemId))).toEqual([]);
  });

  it('stacks layers back to front: legs, tops, jackets, vest, hands, head', () => {
    expect(duckLayers(['headlamp', 'toque', 'raincoat', 'long-sleeve', 'tights', 'reflective-vest', 'mittens'])).toEqual([
      'tights',
      'long-sleeve',
      'raincoat',
      'reflective-vest',
      'mittens',
      'toque',
      'headlamp',
    ]);
    expect(duckLayers(['singlet', 'shorts'])).toEqual(['shorts']);
  });

  it('falling weather: snow wins over rain, none otherwise', () => {
    expect(whatToWear(base(8, { code: 63, rainMm: 2 })).effect).toBe('rain');
    expect(whatToWear(base(1, { code: 73, snowCm: 1, rainMm: 0.5 })).effect).toBe('snow');
    expect(whatToWear(base(8, { light: 'dark' })).effect).toBeNull();
  });
});

describe('<DressedDuck>', () => {
  it('draws the base duck plus one layer per item, hidden from assistive tech', () => {
    const outfit = whatToWear(base(-15, { light: 'dark' }));
    const { container } = render(<DressedDuck items={outfit.drawn} weather={null} />);
    const duck = container.querySelector('.dressed-duck') as HTMLElement;
    expect(duck.getAttribute('aria-hidden')).toBe('true');
    const pieces = [...duck.querySelectorAll('img[data-piece]')].map((img) => img.getAttribute('data-piece'));
    expect(pieces).toEqual(duckLayers(outfit.drawn));
    expect(pieces).toEqual(expect.arrayContaining(['toque', 'mittens', 'reflective-vest', 'headlamp']));
    expect([...duck.querySelectorAll('img')].every((img) => img.getAttribute('alt') === '')).toBe(true);
    expect(duck.querySelector('.duck-weather')).toBeNull();
  });

  it('draws exactly the shared composer\'s list (the story uses the same one)', () => {
    const outfit = whatToWear(base(0, { code: 63, rainMm: 2, windKmh: 30 }));
    const { container } = render(<DressedDuck items={outfit.drawn} weather={outfit.effect} />);
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(duckImages(outfit.drawn).map((i) => i.url));
    expect(duckImages(outfit.drawn)[0].id).toBe('base');
  });

  it('shows falling rain or snow when the outfit calls for it', () => {
    const { container } = render(<DressedDuck items={['raincoat']} weather="rain" />);
    expect(container.querySelector('.duck-weather--rain')?.children.length).toBeGreaterThan(5);
  });
});
