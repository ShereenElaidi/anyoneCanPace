import { lazy, Suspense, useState, type ReactNode } from 'react';
import { EVENT, mapsLink, nextRun, type RunTimes } from '../event/event';
import { FORECAST_DAYS, freshForecastReaches, MONTREAL, type Forecast } from '../weather/forecast';
import { makeSnapshot, type StorySnapshot } from '../story/snapshot';
import { clockTime } from './format';

/** The story's drawing code only loads when someone makes a story. */
const StoryDialog = lazy(() => import('../story/StoryDialog'));

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long', month: 'long', day: 'numeric' });
const monthDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, month: 'long', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long' });

/** The weekday a fresh forecast first reaches the run ("Wednesday"). */
export const forecastReachesFrom = (run: RunTimes) => weekdayFmt.format(run.startAt - (FORECAST_DAYS - 1) * 86_400_000);

/**
 * Why the run has no outfit yet. Before a fresh forecast reaches it: the day it will.
 * After: the saved copy is short (offline, a failed download, an older app), so REFRESH.
 */
export function outfitLaterText(run: RunTimes, now: number): string {
  return freshForecastReaches(run.startAt, now)
    ? `${EVENT.weekday}’s outfit isn’t in the saved forecast yet. REFRESH to get it.`
    : `${EVENT.weekday}’s outfit shows up ${forecastReachesFrom(run)}.`;
}

/**
 * The weekly run (src/data/event.json): the day and start time, what to wear
 * for it (`children`: the outfit, or why there isn't one yet), then where we meet.
 */
export function SundayRun({ now, children }: { now: number; children: ReactNode }) {
  const run = nextRun(now);
  return (
    <section className="dash-run dash-run--main" aria-label={`${EVENT.name}`}>
      <p className="dash-run__when">
        <span className="dash-run__date">Next Stooopid {EVENT.weekday}:</span>
        <span className="dash-run__meet-time">
          {monthDayFmt.format(run.startAt)}, {clockTime(run.meetAt).replace(":00", "").replace(/ /g, "\u00a0")}
        </span>
      </p>
      {children}
    </section>
  );
}

/**
 * For whoever posts the Sunday story: MAKE STORY.
 */
export function SundayStory({ now, forecast }: { now: number; forecast: Forecast | null }) {
  const run = nextRun(now);
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
        freshForecastReaches(r.run.startAt, Date.now())
          ? `The saved forecast doesn’t reach ${dateFmt.format(r.run.startAt)}. REFRESH, then try again.`
          : `The forecast doesn’t reach ${dateFmt.format(r.run.startAt)} yet. It covers ${FORECAST_DAYS} days: try from ${forecastReachesFrom(r.run)}.`,
      );
    }
  }

  const message =
    storyProblem ||
    (!covered && forecast
      ? freshForecastReaches(run.startAt, now)
        ? `REFRESH to get ${EVENT.weekday}’s forecast for the story.`
        : `The story works from ${forecastReachesFrom(run)}.`
      : '');

  return (
    <section className="dash-story" aria-labelledby="post-story-title">
      <h2 id="post-story-title" className="dash__h3">
        Generate Insta Story Pic
      </h2>
      <div className="dash-run__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={makeStory}>
          MAKE STORY
        </button>
      </div>
      <p className="dash-story__message" aria-live="polite">
        {message}
      </p>
      {story && (
        <Suspense fallback={null}>
          <StoryDialog snapshot={story} onRemake={makeStory} onClose={() => setStory(null)} />
        </Suspense>
      )}
    </section>
  );
}

/** Where we meet: the map link to open, or to paste into an Instagram Link sticker. */
export function SundayLocation() {
  const link = mapsLink();
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
    <section className="dash-story" aria-labelledby="location-title">
      <h2 id="location-title" className="dash__h3">
        Location Deets
      </h2>
      <div className="dash-run__actions">
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void copyLink()}>
          COPY MAP LINK
        </button>
        <a className="btn btn--secondary btn--small" href={link} target="_blank" rel="noopener noreferrer">
          OPEN MAP
        </a>
      </div>
      <p className="dash-story__message" aria-live="polite">
        {copy === 'copied' ? 'Map link copied. Paste it into a Link sticker.' : ''}
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
