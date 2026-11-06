import { useState } from 'react';
import { EVENT, mapsLink, nextRun } from '../event/event';
import { MONTREAL } from '../weather/forecast';
import { clockTime } from './format';

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long', month: 'long', day: 'numeric' });

/**
 * When and where the weekly run meets (src/data/event.json), with the map
 * link to paste into an Instagram Link sticker.
 */
export function SundayRun({ now }: { now: number }) {
  const run = nextRun(now);
  const link = mapsLink();
  const place = EVENT.place;
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy('copied');
    } catch {
      setCopy('failed'); // shows the link to copy by hand
    }
  }

  return (
    <section className="dash-run" aria-labelledby="run-title">
      <h2 id="run-title" className="dash__h2">
        {EVENT.name}
      </h2>
      <p className="dash-run__when">
        {dateFmt.format(run.startAt)} · meet {clockTime(run.meetAt)}, start {clockTime(run.startAt)}
      </p>
      <p>
        <strong>{place.name}</strong>: {place.spot.toLowerCase()}, {place.address}.
      </p>
      <div className="dash-run__actions">
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void copyLink()}>
          COPY MAP LINK
        </button>
        <a className="btn btn--secondary btn--small" href={link} target="_blank" rel="noopener noreferrer">
          OPEN MAP
        </a>
      </div>
      <p className="dash-run__copied" aria-live="polite">
        {copy === 'copied' && 'Map link copied. Paste it into a Link sticker.'}
      </p>
      {copy === 'failed' && (
        <label className="dash-run__manual">
          Couldn’t copy. Press and hold to copy the link:
          <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </section>
  );
}
