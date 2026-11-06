/**
 * The one dressed-duck composer: which images to stack, back to front, for an
 * outfit. The dashboard's <DressedDuck> and the story export both draw exactly
 * this list, so they can't disagree.
 */
import base from '../../assets/duck-outfit/duck-base.webp';
import type { ItemId } from '../../weather/outfit';
import { duckLayers } from './pieces';

/** Every piece's URL, keyed by item id (file name). Each is fetched only when worn. */
const PIECES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['../../assets/duck-outfit/*.webp', '!../../assets/duck-outfit/duck-base.webp'], {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [path.replace(/^.*\/(.+)\.webp$/, '$1'), url]),
) as Partial<Record<ItemId, string>>;

export interface DuckImage {
  /** 'base' for the duck itself. */
  id: ItemId | 'base';
  url: string;
}

/** Base duck first, then each drawn piece that has art, in stacking order. All same-origin, 512 × 512, drawn in place. */
export function duckImages(drawn: readonly ItemId[]): DuckImage[] {
  return [
    { id: 'base', url: base },
    ...duckLayers(drawn).flatMap((id) => (PIECES[id] ? [{ id, url: PIECES[id] }] : [])),
  ];
}
