/**
 * One playful line for the Sunday story's poster, picked from the weather.
 * Hand-written: edit the lists freely (keep each line short, ~40 characters,
 * so it fits on two lines of the story). Pure.
 *
 * - Serious weather (frostbite risk, freezing rain) gets no joke: the
 *   warning speaks alone.
 * - The weather decides the list; the run's date picks the line, so it
 *   changes from week to week but is the same every time the story is remade.
 */
import type { Condition } from '../weather/outfit';

export const FUN_LINES = {
  heat: ['Hot one! Easy pace, lots of water.', 'Sunscreen on, quack on.'],
  snow: ['Fresh snow, fresh tracks.', 'Snow day! Waddle with care.'],
  rain: ['A little rain never hurt a flock.', 'Puddles optional. Stooopidity mandatory.'],
  wind: ['Windy! Tuck in behind your pacer.', 'Hold onto your hat!'],
  warm: ['Perfect running weather. See you there!', 'Shorts weather. Let’s go!'],
  mild: ['Perfect running weather. See you there!', 'Fresh air, good company.'],
  cool: ['Crisp and fresh: ideal for a run.', 'Cool air, warm crew.'],
  chilly: ['Chilly start, warm finish.', 'Cold hands, warm hearts.'],
  cold: ['Cold hands, warm hearts.', 'Frosty out. We’ll warm up together.'],
} as const satisfies Record<string, readonly string[]>;

export type FunMood = keyof typeof FUN_LINES;

/** Which list fits the weather, or null when the weather is no joke. */
export function funMood(tempC: number, conditions: readonly Condition[]): FunMood | null {
  const has = (c: Condition) => conditions.includes(c);
  if (has('frostbite') || has('freezing-rain')) return null;
  if (has('heat')) return 'heat';
  if (has('snow') || has('wet-snow')) return 'snow';
  if (has('rain')) return 'rain';
  if (has('wind')) return 'wind';
  if (tempC >= 18) return 'warm';
  if (tempC >= 12) return 'mild';
  if (tempC >= 5) return 'cool';
  if (tempC >= -5) return 'chilly';
  return 'cold';
}

/** The line for a run on `date` (YYYY-MM-DD), or null. */
export function funLine(tempC: number, conditions: readonly Condition[], date: string): string | null {
  const mood = funMood(tempC, conditions);
  if (!mood) return null;
  const lines = FUN_LINES[mood];
  const week = Math.floor(Date.parse(`${date}T12:00:00Z`) / (7 * 86_400_000));
  return lines[((week % lines.length) + lines.length) % lines.length];
}
