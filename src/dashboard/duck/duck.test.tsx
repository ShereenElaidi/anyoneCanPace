import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ITEM_LABEL, whatToWear, type ItemId, type OutfitInput } from '../../weather/outfit';
import { DressedDuck } from './DressedDuck';
import { duckLayers, duckWeather, LAYER_ORDER } from './pieces';

const pieceFiles = Object.keys(import.meta.glob('../../assets/duck-outfit/*.svg')).map((p) =>
  p.replace(/^.*\/(.+)\.svg$/, '$1'),
);

const base = (feelsC: number, o: Partial<OutfitInput> = {}): OutfitInput => ({
  tempC: feelsC,
  feelsC,
  precipProb: 0,
  rainMm: 0,
  snowCm: 0,
  snowDepthM: 0,
  code: 3,
  windKmh: 5,
  gustKmh: 10,
  uvIndex: 0,
  light: 'day',
  ...o,
});

describe('dressed duck pieces', () => {
  it('every outfit item has a drawing, except the singlet the base duck already wears', () => {
    const items = Object.keys(ITEM_LABEL) as ItemId[];
    expect(items.filter((id) => !pieceFiles.includes(id))).toEqual(['singlet']);
    expect(items.filter((id) => !LAYER_ORDER.includes(id))).toEqual(['singlet']);
    expect(pieceFiles.filter((f) => !LAYER_ORDER.includes(f as ItemId))).toEqual([]);
  });

  it('stacks layers back to front: legs, tops, jackets, vest, hands, head', () => {
    expect(duckLayers(['sunglasses', 'cap', 'raincoat', 'long-sleeve', 'tights', 'reflective-vest', 'gloves'])).toEqual([
      'tights',
      'long-sleeve',
      'raincoat',
      'reflective-vest',
      'gloves',
      'cap',
      'sunglasses',
    ]);
    expect(duckLayers(['singlet', 'shorts'])).toEqual(['shorts']);
  });

  it('falling weather: snow wins over rain, none otherwise', () => {
    expect(duckWeather(['rain', 'wind'])).toBe('rain');
    expect(duckWeather(['rain', 'snow', 'slippery'])).toBe('snow');
    expect(duckWeather(['dark'])).toBeNull();
  });
});

describe('<DressedDuck>', () => {
  it('draws the base duck plus one layer per item, hidden from assistive tech', () => {
    const outfit = whatToWear(base(-15, { light: 'dark' }));
    const { container } = render(<DressedDuck items={outfit.items.map((i) => i.id)} weather={null} />);
    const duck = container.querySelector('.dressed-duck') as HTMLElement;
    expect(duck.getAttribute('aria-hidden')).toBe('true');
    const pieces = [...duck.querySelectorAll('img[data-piece]')].map((img) => img.getAttribute('data-piece'));
    expect(pieces).toEqual(duckLayers(outfit.items.map((i) => i.id)));
    expect(pieces).toEqual(expect.arrayContaining(['toque', 'mittens', 'reflective-vest', 'headlamp']));
    expect([...duck.querySelectorAll('img')].every((img) => img.getAttribute('alt') === '')).toBe(true);
    expect(duck.querySelector('.duck-weather')).toBeNull();
  });

  it('shows falling rain or snow when the outfit calls for it', () => {
    const { container } = render(<DressedDuck items={['raincoat']} weather="rain" />);
    expect(container.querySelector('.duck-weather--rain')?.children.length).toBeGreaterThan(5);
  });
});
