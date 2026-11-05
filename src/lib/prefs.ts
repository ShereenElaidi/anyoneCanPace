import { clampSeconds, DEFAULT_DURATIONS, type Durations } from '../timer/engine';

export interface Prefs extends Durations {
  sound: boolean;
  vibration: boolean;
}

export const DEFAULT_PREFS: Prefs = { ...DEFAULT_DURATIONS, sound: true, vibration: true };

const KEY = 'anyonecanpace:prefs:v1';

/** Reads saved preferences, falling back to defaults for anything missing or invalid. */
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    return {
      run: typeof saved.run === 'number' ? clampSeconds(saved.run) : DEFAULT_PREFS.run,
      walk: typeof saved.walk === 'number' ? clampSeconds(saved.walk) : DEFAULT_PREFS.walk,
      sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULT_PREFS.sound,
      vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULT_PREFS.vibration,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing or storage full: the app keeps working for this visit.
  }
}

// ---------- App mode ----------

/** The modes on the picker. The app always opens on the picker; no mode is remembered. */
export type AppMode = 'timer' | 'sixk' | 'dashboard';
