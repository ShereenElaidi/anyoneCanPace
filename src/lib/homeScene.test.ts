import { describe, expect, it } from 'vitest';
import { DIWALI_2026, specialScene } from './homeScene';

describe('home scene', () => {
  it('shows the Diwali duck until Monday 9 November 2026 at noon in Montréal', () => {
    expect(specialScene(Date.parse('2026-11-08T03:00:00-05:00'))).toBe(DIWALI_2026);
    expect(specialScene(Date.parse('2026-11-09T11:59:59-05:00'))).toBe(DIWALI_2026);
  });

  it('goes back to the riverside duck at noon', () => {
    expect(specialScene(Date.parse('2026-11-09T12:00:00-05:00'))).toBeNull();
    expect(specialScene(Date.parse('2026-12-01T09:00:00-05:00'))).toBeNull();
  });
});
