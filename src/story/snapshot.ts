/**
 * Everything the Sunday story shows, frozen at MAKE STORY. The preview and
 * the saved picture are drawn from the same snapshot, so a forecast refresh
 * in between can't change the outfit. Pure: `now` is passed in.
 */
import { EVENT, nextRun, type MeetingPlace, type RunTimes } from '../event/event';
import { hourAt, weatherText, type Forecast } from '../weather/forecast';
import { whatToWear, type Outfit } from '../weather/outfit';
import { outfitInputFor } from '../weather/runTime';

export interface StorySnapshot {
  /** When MAKE STORY was pressed. */
  madeAt: number;
  /** When the forecast was downloaded. */
  forecastFetchedAt: number;
  eventName: string;
  weekday: string;
  run: RunTimes;
  place: MeetingPlace;
  weather: {
    /** Start of the forecast hour used (the one containing the start time). */
    hourAt: number;
    tempC: number;
    feelsC: number;
    text: string;
    windKmh: number | null;
    precipProb: number | null;
  };
  outfit: Outfit;
}

export type SnapshotResult =
  | { ok: true; snapshot: StorySnapshot }
  /** The forecast doesn't reach the run yet (it covers FORECAST_DAYS days). */
  | { ok: false; reason: 'not-covered'; run: RunTimes };

export function makeSnapshot(f: Forecast, now: number): SnapshotResult {
  const run = nextRun(now);
  const input = outfitInputFor(f, run.startAt);
  const hour = hourAt(f, run.startAt);
  if (!input || !hour) return { ok: false, reason: 'not-covered', run };
  return {
    ok: true,
    snapshot: {
      madeAt: now,
      forecastFetchedAt: f.fetchedAt,
      eventName: EVENT.name,
      weekday: EVENT.weekday,
      run,
      place: EVENT.place,
      weather: {
        hourAt: hour.at,
        tempC: hour.tempC,
        feelsC: hour.feelsC,
        text: weatherText(hour.code),
        windKmh: hour.windKmh,
        precipProb: hour.precipProb,
      },
      outfit: whatToWear(input),
    },
  };
}
