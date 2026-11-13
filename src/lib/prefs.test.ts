import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './prefs';

describe('preferences', () => {
  it('defaults to 90 s RUN, 60 s WALK, sound and vibration on', () => {
    expect(loadPrefs()).toEqual({ run: 90, walk: 60, sound: true, vibration: true, loud: true });
  });

  it('round-trips through localStorage', () => {
    savePrefs({ run: 45, walk: 120, sound: false, vibration: false, loud: false });
    expect(loadPrefs()).toEqual({ run: 45, walk: 120, sound: false, vibration: false, loud: false });
  });

  it('repairs corrupt or out-of-range values', () => {
    localStorage.setItem('anyonecanpace:prefs:v1', JSON.stringify({ run: 2, walk: 'x', sound: 'yes' }));
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS, run: 15 });
    localStorage.setItem('anyonecanpace:prefs:v1', '{not json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});
