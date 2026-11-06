import { lazy, Suspense, useState } from 'react';
import { EVENT, mapsLink, nextRun } from '../event/event';
import { FORECAST_DAYS, MONTREAL, type Forecast } from '../weather/forecast';
import { makeSnapshot, type StorySnapshot } from '../story/snapshot';
import { clockTime } from './format';

/** The story's drawing code only loads when someone makes a story. */
const StoryDialog = lazy(() => import('../story/StoryDialog'));

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long', month: 'long', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long' });

/**
 * When and where the weekly run meets (src/data/event.json), the map link to
 * paste into an Instagram Link sticker, and MAKE STORY.
 */
export function SundayRun({ now, forecast }: { now: number; forecast: Forecast | null }) {
  const run = nextRun(now);
  const link = mapsLink();
  const place = EVENT.place;
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [story, setStory] = useState<StorySnapshot | null>(null);
  const [storyProblem, setStoryProblem] = useState('');

  /** Freeze the forecast, outfit and event right now; the dialog draws only this. */
  function makeStory() {
    if (!forecast) {
      setStoryProblem('No forecast yet. Connect to the internet and REFRESH.');
      return;
    }
    const r = makeSnapshot(forecast, Date.now());
    if (r.ok) {
      setStoryProblem('');
      setStory(r.snapshot);
    } else {
      const from = weekdayFmt.format(r.run.startAt - (FORECAST_DAYS - 1) * 86_400_000);
      setStoryProblem(`The forecast doesn’t reach ${dateFmt.format(r.run.startAt)} yet. It covers ${FORECAST_DAYS} days: try from ${from}.`);
    }
  }

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
      <div className="dash-run__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={makeStory}>
          MAKE STORY
        </button>
      </div>
      <p className="dash-run__copied" aria-live="polite">
        {storyProblem}
      </p>
      <p className="dash-run__copied" aria-live="polite">
        {copy === 'copied' && 'Map link copied. Paste it into a Link sticker.'}
      </p>
      {copy === 'failed' && (
        <label className="dash-run__manual">
          Couldn’t copy. Press and hold to copy the link:
          <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      {story && (
        <Suspense fallback={null}>
          <StoryDialog snapshot={story} onRemake={makeStory} onClose={() => setStory(null)} />
        </Suspense>
      )}
    </section>
  );
}
