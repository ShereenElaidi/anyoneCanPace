/**
 * The weekly group run: when and where we meet. Hand-edited in
 * src/data/event.json (see design/weather-v1-spec.md §8). Pure: `now` is
 * always passed in, and times are Montréal's whatever the phone's zone.
 */
import eventFile from '../data/event.json';
import { MONTREAL } from '../weather/forecast';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface MeetingPlace {
  name: string;
  /** Where exactly to stand ("At the café entrance"). */
  spot: string;
  address: string;
  lat: number;
  lon: number;
}

export interface RunEvent {
  name: string;
  weekday: Weekday;
  /** "HH:MM", Montréal time. */
  meetTime: string;
  startTime: string;
  durationMin: number;
  place: MeetingPlace;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Problems with an event file, in words; empty when it's fine. */
export function validateEvent(e: RunEvent): string[] {
  const errors: string[] = [];
  if (!WEEKDAYS.includes(e.weekday)) errors.push(`weekday must be one of ${WEEKDAYS.join(', ')}`);
  if (!HHMM.test(e.meetTime)) errors.push('meetTime must be HH:MM');
  if (!HHMM.test(e.startTime)) errors.push('startTime must be HH:MM');
  if (HHMM.test(e.meetTime) && HHMM.test(e.startTime) && e.meetTime > e.startTime)
    errors.push('meetTime must be at or before startTime');
  if (!(e.durationMin > 0 && e.durationMin <= 240)) errors.push('durationMin must be 1–240');
  const p = e.place;
  if (!p?.name || !p.spot || !p.address) errors.push('place needs name, spot and address');
  // Montréal island and around: catches swapped or mistyped coordinates.
  if (!(p?.lat > 45.3 && p.lat < 45.8 && p.lon > -74.1 && p.lon < -73.3)) errors.push('place lat/lon are not in Montréal');
  return errors;
}

export const EVENT = eventFile as RunEvent;

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: MONTREAL.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'long',
});

function local(at: number) {
  const p = Object.fromEntries(parts.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, weekday: p.weekday as Weekday };
}

/** Epoch ms for a Montréal wall-clock time (handles daylight saving). */
export function montrealTime(y: number, m: number, d: number, hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Correct by the zone's offset at that moment; twice, in case the guess straddles a change.
  let at = guess;
  for (let i = 0; i < 2; i++) {
    const l = local(at);
    at += guess - Date.UTC(l.y, l.m - 1, l.d, l.hh, l.mm);
  }
  return at;
}

export interface RunTimes {
  /** YYYY-MM-DD in Montréal. */
  date: string;
  meetAt: number;
  startAt: number;
}

/** The next run that hasn't finished yet (today's, until it ends). */
export function nextRun(now: number, e: RunEvent = EVENT): RunTimes {
  const target = WEEKDAYS.indexOf(e.weekday);
  const today = local(now);
  for (let add = 0; add <= 7; add++) {
    // Noon UTC on the local date + add days: always the right calendar day.
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + add, 12));
    if (day.getUTCDay() !== target) continue;
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    const startAt = montrealTime(y, m, d, e.startTime);
    if (startAt + e.durationMin * 60_000 <= now) continue;
    return {
      date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      meetAt: montrealTime(y, m, d, e.meetTime),
      startAt,
    };
  }
  throw new Error('No upcoming run found');
}

/** A link that opens the meeting point in a maps app (for Instagram's Link sticker). */
export function mapsLink(p: MeetingPlace = EVENT.place): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
}
