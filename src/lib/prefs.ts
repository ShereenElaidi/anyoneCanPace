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

export type AppMode = 'timer' | 'sixk';

const MODE_KEY = 'anyonecanpace:mode:v1';
const MODES: readonly AppMode[] = ['timer', 'sixk'];

/**
 * The mode to open straight into, or null to show the mode picker.
 * People who used the timer before modes existed have saved timer settings,
 * so they keep opening straight into the timer.
 */
export function loadMode(): AppMode | null {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved && (MODES as readonly string[]).includes(saved)) return saved as AppMode;
    return localStorage.getItem(KEY) ? 'timer' : null;
  } catch {
    return null;
  }
}

export function saveMode(mode: AppMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage unavailable: the picker shows next time, which is fine.
  }
}
