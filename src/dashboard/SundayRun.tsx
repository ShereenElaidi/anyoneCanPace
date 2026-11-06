import { lazy, Suspense, useState, type ReactNode } from 'react';
import { EVENT, mapsLink, nextRun, type RunTimes } from '../event/event';
import { FORECAST_DAYS, MONTREAL, type Forecast } from '../weather/forecast';
import { makeSnapshot, type StorySnapshot } from '../story/snapshot';
import { clockTime } from './format';

/** The story's drawing code only loads when someone makes a story. */
const StoryDialog = lazy(() => import('../story/StoryDialog'));

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long', month: 'long', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long' });

/** The weekday a fresh forecast first reaches the run ("Wednesday"). */
export const forecastReachesFrom = (run: RunTimes) => weekdayFmt.format(run.startAt - (FORECAST_DAYS - 1) * 86_400_000);

/**
 * The weekly run (src/data/event.json): the day and start time, what to wear
 * for it (`children`: the outfit, or why there isn't one yet), then where we meet.
 */
export function SundayRun({ now, children }: { now: number; children: ReactNode }) {
  const run = nextRun(now);
  const place = EVENT.place;
  return (
    <section className="dash-run dash-run--main" aria-labelledby="run-title">
      <h2 id="run-title" className="dash__h2">
        {EVENT.name}
      </h2>
      <p className="dash-run__when">
        {dateFmt.format(run.startAt)} · start {clockTime(run.startAt)}
      </p>
      {children}
      <div className="dash-run__meet">
        <p>
          <strong>Meet {clockTime(run.meetAt)}</strong> at {place.name}: {place.spot.toLowerCase()}, {place.address}.
        </p>
        <div className="dash-run__actions">
          <a className="btn btn--secondary btn--small" href={mapsLink()} target="_blank" rel="noopener noreferrer">
            OPEN MAP
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * For whoever posts the Sunday story: MAKE STORY and the map link to paste
 * into an Instagram Link sticker.
 */
export function SundayStory({ now, forecast }: { now: number; forecast: Forecast | null }) {
  const run = nextRun(now);
  const link = mapsLink();
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [story, setStory] = useState<StorySnapshot | null>(null);
  const [storyProblem, setStoryProblem] = useState('');
  const covered = forecast !== null && makeSnapshot(forecast, now).ok;

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
      setStoryProblem(
        `The forecast doesn’t reach ${dateFmt.format(r.run.startAt)} yet. It covers ${FORECAST_DAYS} days: try from ${forecastReachesFrom(r.run)}.`,
      );
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

  const message =
    storyProblem || (copy === 'copied' ? 'Map link copied. Paste it into a Link sticker.' : '') ||
    (!covered && forecast ? `The story works from ${forecastReachesFrom(run)}.` : '');

  return (
    <section className="dash-story" aria-labelledby="post-story-title">
      <h2 id="post-story-title" className="dash__h3">
        Post the {EVENT.weekday} story
      </h2>
      <div className="dash-run__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={makeStory}>
          MAKE STORY
        </button>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void copyLink()}>
          COPY MAP LINK
        </button>
      </div>
      <p className="dash-story__message" aria-live="polite">
        {message}
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
