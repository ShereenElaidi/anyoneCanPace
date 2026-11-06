/**
 * The outfit in two short sentences, shared by the dashboard and the Sunday
 * story: the layers ("Thermal top, insulated jacket, winter tights.") and
 * everything else ("mittens, toque, neck warmer."). Pure.
 */
import type { Outfit } from './outfit';

const isLayer = (o: Outfit, id: string) => [o.base, o.warm, o.outer, o.legs].some((l) => l !== null && l === id);
const sentence = (words: string[]) => (words.length ? `${words.join(', ')}.` : '');

/** "Tee, shorts.": the clothes, capitalised. */
export function layersText(o: Outfit): string {
  const s = sentence(o.wear.filter((i) => isLayer(o, i.id)).map((i) => i.label.toLowerCase()));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "reflective vest, gloves.": what the layers leave out, or "" when nothing. */
export function extrasText(o: Outfit): string {
  return sentence(o.wear.filter((i) => !isLayer(o, i.id)).map((i) => i.label.toLowerCase()));
}
