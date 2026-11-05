import base from '../../assets/duck-outfit/duck-base.webp';
import type { ItemId } from '../../weather/outfit';
import { duckLayers, type DuckWeather } from './pieces';

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

const DROPS = 14;

/**
 * The mascot dressed for the run: the base drawing with one transparent SVG
 * layer per outfit item. Purely decorative (hidden from assistive tech); the
 * text outfit list carries the meaning.
 */
export function DressedDuck({ items, weather }: { items: readonly ItemId[]; weather: DuckWeather }) {
  const layers = duckLayers(items).filter((id) => PIECES[id]);
  return (
    <div className="dressed-duck" aria-hidden="true" data-layers={layers.join(' ')}>
      {weather && (
        <div className={`duck-weather duck-weather--${weather}`}>
          {Array.from({ length: DROPS }, (_, i) => (
            <span key={i} style={{ left: `${(i * 73) % 100}%`, animationDelay: `${((i * 37) % 100) / 50}s` }} />
          ))}
        </div>
      )}
      <img className="dressed-duck__layer" src={base} alt="" draggable={false} />
      {layers.map((id) => (
        <img key={id} className="dressed-duck__layer" src={PIECES[id]} alt="" draggable={false} data-piece={id} />
      ))}
    </div>
  );
}
