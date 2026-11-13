import { MONTREAL } from '../weather/forecast';
import { localDate } from '../weather/runTime';

const time = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, hour: 'numeric', minute: '2-digit' });
const hourOnly = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, hour: 'numeric' });
const weekday = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long' });

/** "Today", "Tomorrow", "Yesterday" or the weekday, in Montréal time. */
export function dayLabel(at: number, now: number): string {
  const d = localDate(at);
  if (d === localDate(now)) return 'Today';
  if (d === localDate(now + 86_400_000)) return 'Tomorrow';
  if (d === localDate(now - 86_400_000)) return 'Yesterday';
  return weekday.format(at);
}

/** "7:42 a.m." */
export const clockTime = (at: number) => time.format(at);

/** "9 a.m." */
export const hourLabel = (at: number) => hourOnly.format(at);

/** "Today 9 a.m." */
export const runTimeLabel = (at: number, now: number) => `${dayLabel(at, now)} ${hourLabel(at)}`;

/** "15 °C", with a no-break space so the unit never wraps away from the number. */
export const degrees = (c: number) => `${Math.round(c)}\u00a0°C`;
