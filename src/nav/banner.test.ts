import { describe, expect, it } from 'vitest';
import { describe as describeBanner, formatDistance, formatKm, statsLine } from './banner';
import { bearingDeg, compassWord, distanceM, headingChange, offsetPoint } from './geo';
import { prepareRoute } from './route';
import { begin, createNav, update, type NavState } from './tracker';

// An L-shaped route: 1000 m north, then right (east) 1000 m.
const origin = { lat: 45.5, lon: -73.6 };
const corner = offsetPoint(origin, 0, 1000);
const end = offsetPoint(corner, 90, 1000);
const route = prepareRoute(
  [
    [origin.lon, origin.lat],
    [corner.lon, corner.lat],
    [end.lon, end.lat],
  ],
  [{ atM: 1000, dir: 'right', street: 'rue Rachel', note: 'Cross at the light' }],
);

const at = (progressM: number): NavState => ({
  ...begin(route, createNav(route), { ...origin, accuracyM: 5, at: 0 }, 0).state,
  progressM,
});

describe('geo helpers', () => {
  it('measures distance and bearing', () => {
    expect(distanceM(origin, corner)).toBeCloseTo(1000, 0);
    expect(bearingDeg(origin, corner)).toBeCloseTo(0, 0);
    expect(bearingDeg(corner, end)).toBeCloseTo(90, 0);
    expect(headingChange(350, 10)).toBe(20);
    expect(headingChange(10, 350)).toBe(-20);
    expect(compassWord(44)).toBe('northeast');
    expect(compassWord(350)).toBe('north');
  });
});

describe('banner text', () => {
  it('formats distances for glancing', () => {
    expect(formatDistance(147)).toBe('150 m');
    expect(formatDistance(28)).toBe('30 m');
    expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatKm(3249)).toBe('3.2 km');
  });

  it('between turns: "Continue … for", then the next turn', () => {
    const b = describeBanner(route, at(200), 'avenue du Parc');
    expect(b.primary).toBe('Continue on avenue du Parc for 800 m');
    expect(b.secondary).toBe('Then right on rue Rachel.');
    expect(b.icon).toBe('straight');
  });

  it('heads-up: "Right on rue Rachel in 150 m" with the note', () => {
    const b = describeBanner(route, at(850));
    expect(b.primary).toBe('Right on rue Rachel in 150 m');
    expect(b.secondary).toBe('Cross at the light');
    expect(b.icon).toBe('right');
    expect(b.tone).toBe('soon');
  });

  it('at the turn: "Right now"', () => {
    expect(describeBanner(route, at(985)).primary).toBe('Right now on rue Rachel');
  });

  it('after the last turn: the new street and the finish', () => {
    const b = describeBanner(route, at(1200));
    expect(b.primary).toBe('Finish in 800 m');
    expect(b.secondary).toBe('Continue on rue Rachel.');
  });

  it('stats line', () => {
    expect(statsLine(route, at(1234))).toBe('1.2 km done · 0.8 km to go');
  });

  it('approach: head to the start with a direction in words', () => {
    const away = offsetPoint(origin, 180, 600); // south of the start
    const state = { ...createNav(route), lastFix: { ...away, accuracyM: 5, at: 0 } };
    const b = describeBanner(route, state);
    expect(b.primary).toBe('Head to the start: 600 m');
    expect(b.secondary).toContain('north');
    expect(b.rotateDeg).toBeCloseTo(0, 0);
  });

  it('finished', () => {
    let state = at(1900);
    state = update(route, state, { ...end, accuracyM: 5, at: 1000 }).state;
    expect(state.status).toBe('finished');
    expect(describeBanner(route, state).primary).toBe('Finished! 2.0 km');
  });
});
