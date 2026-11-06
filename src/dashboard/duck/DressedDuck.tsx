import { duckImages } from './art';
import type { ItemId } from '../../weather/outfit';
import type { DuckWeather } from './pieces';

const DROPS = 14;

/**
 * The mascot dressed for the run: the images from `duckImages`, stacked.
 * Purely decorative (hidden from assistive tech); the text outfit list
 * carries the meaning.
 */
export function DressedDuck({ items, weather }: { items: readonly ItemId[]; weather: DuckWeather }) {
  const images = duckImages(items);
  const layers = images.slice(1);
  return (
    <div className="dressed-duck" aria-hidden="true" data-layers={layers.map((l) => l.id).join(' ')}>
      {weather && (
        <div className={`duck-weather duck-weather--${weather}`}>
          {Array.from({ length: DROPS }, (_, i) => (
            <span key={i} style={{ left: `${(i * 73) % 100}%`, animationDelay: `${((i * 37) % 100) / 50}s` }} />
          ))}
        </div>
      )}
      {images.map((img) => (
        <img
          key={img.id}
          className="dressed-duck__layer"
          src={img.url}
          alt=""
          draggable={false}
          data-piece={img.id === 'base' ? undefined : img.id}
        />
      ))}
    </div>
  );
}
