import { describe, expect, it } from 'vitest';
import { loadMode, saveMode } from './prefs';

describe('remembered mode', () => {
  it('no saved mode and no timer settings: show the picker', () => {
    expect(loadMode()).toBeNull();
  });

  it('existing timer users (saved timer settings) open into the timer', () => {
    localStorage.setItem('anyonecanpace:prefs:v1', JSON.stringify({ run: 90, walk: 60, sound: true, vibration: true }));
    expect(loadMode()).toBe('timer');
  });

  it('remembers the last-used mode and ignores junk', () => {
    saveMode('sixk');
    expect(loadMode()).toBe('sixk');
    localStorage.setItem('anyonecanpace:mode:v1', 'nonsense');
    expect(loadMode()).toBeNull();
  });
});
