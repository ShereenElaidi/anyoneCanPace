/**
 * Which drawing dresses the duck for each outfit item, and in what order the
 * layers stack (back to front). Pure data; DressedDuck renders it.
 *
 * To redraw a piece, replace src/assets/duck-outfit/<id>.webp with a
 * transparent image of the same size as duck-base.webp, drawn in place over
 * the duck. To add one, draw it, then add its id to LAYER_ORDER.
 */
import type { ItemId } from '../../weather/outfit';

/** Back to front. Items not listed have no drawing (the base duck already wears a singlet and headband). */
export const LAYER_ORDER: ItemId[] = [
  'tights',
  'shorts',
  'thermal-layers',
  'tee',
  'long-sleeve',
  'light-jacket',
  'windbreaker',
  'windproof-shell',
  'raincoat',
  'reflective-vest',
  'neck-warmer',
  'light-gloves',
  'mittens',
  'headband',
  'toque',
  'headlamp',
];

/** The drawable layers for an outfit, back to front, each once. */
export function duckLayers(items: readonly ItemId[]): ItemId[] {
  const wanted = new Set(items);
  return LAYER_ORDER.filter((id) => wanted.has(id));
}

/** Falling weather drawn over the duck (the outfit's `effect`). */
export type DuckWeather = 'rain' | 'snow' | null;
