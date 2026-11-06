import { describe, expect, it } from 'vitest';
import { offsetPoint } from '../../nav/geo';
import { pointAt, prepareRoute } from '../../nav/route';
import type { Turn } from '../../nav/types';
import { clickOptions, dirFromAngle, guessDir, insertTurn, notesForTurns, openSuggestions } from './turnEdit';
import type { ReviewTurn } from './types';

// An L: 500 m north, then a right turn and 500 m east.
const start = { lat: 45.5, lon: -73.6 };
const corner = offsetPoint(start, 0, 500);
const end = offsetPoint(corner, 90, 500);
const L = prepareRoute([start, corner, end].map((p) => [p.lon, p.lat] as [number, number]));

// Out and back along the same street: 400 m east, then back.
const far = offsetPoint(start, 90, 400);
const outBack = prepareRoute([start, far, start].map((p) => [p.lon, p.lat] as [number, number]));

describe('clickOptions', () => {
  it('finds where a click lands on the route', () => {
    const click = offsetPoint(pointAt(L, 200), 270, 10); // 10 m west of the first leg
    expect(clickOptions(L, click)).toEqual([{ atM: 200, offM: 10 }]);
  });

  it('ignores clicks far from the route', () => {
    expect(clickOptions(L, offsetPoint(pointAt(L, 200), 270, 80))).toEqual([]);
  });

  it('offers every leg when legs overlap, instead of guessing the nearest', () => {
    const click = offsetPoint(pointAt(outBack, 100), 0, 5);
    expect(clickOptions(outBack, click).map((o) => o.atM)).toEqual([100, 700]);
  });
});

describe('direction guesses', () => {
  it('uses the build’s angle thresholds', () => {
    expect(dirFromAngle(5)).toBe('straight');
    expect(dirFromAngle(-40)).toBe('slight-left');
    expect(dirFromAngle(90)).toBe('right');
    expect(dirFromAngle(-130)).toBe('sharp-left');
    expect(dirFromAngle(175)).toBe('u-turn');
  });

  it('reads the heading change around a point', () => {
    expect(guessDir(L, 500)).toBe('right');
    expect(guessDir(L, 200)).toBe('straight');
    expect(guessDir(outBack, 400)).toBe('u-turn');
  });
});

describe('insertTurn', () => {
  const turns: Turn[] = [
    { atM: 100, dir: 'left', street: 'A' },
    { atM: 500, dir: 'right', street: 'B' },
  ];
  it('keeps turns in order', () => {
    expect(insertTurn(turns, { atM: 300, dir: 'left', street: '' })).toEqual({
      turns: [turns[0], { atM: 300, dir: 'left', street: '' }, turns[1]],
    });
  });
  it('refuses a turn on top of another', () => {
    expect(insertTurn(turns, { atM: 503, dir: 'left', street: '' })).toEqual({ error: 'There is already a turn at 0.50 km.' });
  });
});

describe('build suggestions', () => {
  const c = (atM: number, decision: string, needsReview: boolean, dir = 'right', streetAfter = 'B'): ReviewTurn => ({
    atM,
    dir,
    decision,
    needsReview,
    reason: `reason ${atM}`,
    streetAfter,
  });
  const turns: Turn[] = [
    { atM: 100, dir: 'left', street: 'A' },
    { atM: 500, dir: 'right', street: 'B' },
  ];

  it('notes the matching candidate, and what the build would call it when the turn differs', () => {
    const notes = notesForTurns(turns, [c(110, 'retained', true, 'slight-left', 'A'), c(495, 'consolidated', false)]);
    expect(notes).toEqual([
      { needsReview: true, reason: 'reason 110', suggested: 'slight-left onto A' },
      { needsReview: false, reason: 'reason 495' },
    ]);
    // A rejected candidate is never "this turn".
    expect(notesForTurns(turns, [c(100, 'rejected', true)])).toEqual([null, null]);
  });

  it('lists suggestions with no turn near them: dropped proposals and unsure rejections', () => {
    const open = openSuggestions(turns, [
      c(100, 'retained', false),
      c(800, 'retained', false), // proposed, no longer in the list
      c(900, 'rejected', true), // dropped, but flagged
      c(950, 'rejected', false), // dropped, sure
    ]);
    expect(open.map((s) => s.atM)).toEqual([800, 900]);
  });
});
