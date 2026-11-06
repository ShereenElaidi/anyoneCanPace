import { describe, expect, it } from 'vitest';
import { FUN_LINES, funLine, funMood } from './funLines';
import { textWidth } from './layout';

describe('fun line', () => {
  it('serious weather gets no joke', () => {
    expect(funMood(-20, ['frostbite', 'wind'])).toBeNull();
    expect(funMood(-1, ['freezing-rain'])).toBeNull();
    expect(funLine(-20, ['frostbite'], '2026-11-08')).toBeNull();
  });

  it('the weather picks the list: heat, snow, rain, wind, then the temperature', () => {
    expect(funMood(31, ['heat'])).toBe('heat');
    expect(funMood(0, ['wet-snow', 'wind'])).toBe('snow');
    expect(funMood(8, ['rain', 'wind'])).toBe('rain');
    expect(funMood(10, ['wind'])).toBe('wind');
    expect(funMood(20, [])).toBe('warm');
    expect(funMood(15, ['dark'])).toBe('mild');
    expect(funMood(7, [])).toBe('cool');
    expect(funMood(0, [])).toBe('chilly');
    expect(funMood(-10, [])).toBe('cold');
  });

  it('changes from week to week, and is the same for the same run', () => {
    const a = funLine(15, [], '2026-11-08');
    expect(funLine(15, [], '2026-11-08')).toBe(a);
    expect(funLine(15, [], '2026-11-15')).not.toBe(a);
    expect(funLine(15, [], '2026-11-22')).toBe(a);
  });

  it('every line fits two lines of the story', () => {
    for (const line of Object.values(FUN_LINES).flat()) expect(textWidth(line, 42, 'comic'), line).toBeLessThanOrEqual(2 * 960);
  });
});
