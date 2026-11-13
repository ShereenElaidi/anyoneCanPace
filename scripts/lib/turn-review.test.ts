import { describe, expect, it } from 'vitest';
import type { Turn } from '../../src/nav/types.ts';
import { decideTurns, geometryFingerprint, positionAt } from './turn-review.ts';

type Coord = [number, number];
// An L: 500 m east, then 500 m north (roughly, at Montréal's latitude).
const DEG_LON = 1 / (111320 * Math.cos((45.5 * Math.PI) / 180));
const DEG_LAT = 1 / 110574;
const at = (eastM: number, northM: number): Coord => [-73.57 + eastM * DEG_LON, 45.5 + northM * DEG_LAT];
const oldCoords: Coord[] = [at(0, 0), at(500, 0), at(500, 500)];
// Same corner, but the route now starts 100 m further west: every distance shifts by 100 m.
const newCoords: Coord[] = [at(-100, 0), at(500, 0), at(500, 500)];

const edited: Turn[] = [{ atM: 500, dir: 'left', street: 'Rue Hand-Fixed', note: 'Cross at the lights' }];
const proposedNew: Turn[] = [{ atM: 600, dir: 'left', street: 'Rue Suggested' }];

describe('turn positions after geometry changes', () => {
  it('fingerprints are stable and change with the geometry', () => {
    expect(geometryFingerprint(oldCoords)).toBe(geometryFingerprint([...oldCoords]));
    expect(geometryFingerprint(newCoords)).not.toBe(geometryFingerprint(oldCoords));
  });

  it('unchanged rebuild: hand-edited turns (with their manual street and note) are kept as they are', () => {
    const d = decideTurns({
      existingTurns: edited,
      existingFingerprint: geometryFingerprint(oldCoords),
      oldCoords,
      newCoords: oldCoords,
      proposed: [{ atM: 500, dir: 'left', street: 'Rue Suggested' }],
      reset: false,
    });
    expect(d.outcome).toBe('kept');
    expect(d.turns).toBe(edited);
    expect(d.geometryChanged).toBe(false);
  });

  it('changed geometry: the old distances are not silently reused', () => {
    const d = decideTurns({
      existingTurns: edited,
      existingFingerprint: geometryFingerprint(oldCoords),
      oldCoords,
      newCoords,
      proposed: proposedNew,
      reset: false,
    });
    expect(d.outcome).toBe('stale');
    expect(d.geometryChanged).toBe(true);
  });

  it('no record of the old geometry at all: treated as stale too', () => {
    const d = decideTurns({ existingTurns: edited, oldCoords: null, newCoords, proposed: proposedNew, reset: false });
    expect(d.outcome).toBe('stale');
  });

  it('reset after a change: fresh distances, with the manual street and note carried over by position', () => {
    const d = decideTurns({
      existingTurns: edited,
      existingFingerprint: geometryFingerprint(oldCoords),
      oldCoords,
      newCoords,
      proposed: proposedNew,
      reset: true,
    });
    expect(d.outcome).toBe('regenerated');
    expect(d.turns).toEqual([{ atM: 600, dir: 'left', street: 'Rue Hand-Fixed', note: 'Cross at the lights' }]);
    expect(d.carried).toBe(1);
    expect(d.dropped).toEqual([]);
  });

  it('reset: an old edited turn with no new turn at its place is reported, not attached somewhere else', () => {
    const d = decideTurns({
      existingTurns: [...edited, { atM: 800, dir: 'right', street: 'Rue Gone', note: 'Watch the gravel' }],
      existingFingerprint: geometryFingerprint(oldCoords),
      oldCoords,
      newCoords,
      proposed: proposedNew,
      reset: true,
    });
    expect(d.turns).toHaveLength(1);
    expect(d.dropped.map((t) => t.street)).toEqual(['Rue Gone']);
  });

  it('first build: the proposals are used', () => {
    const d = decideTurns({ existingTurns: null, oldCoords: null, newCoords, proposed: proposedNew, reset: false });
    expect(d.outcome).toBe('proposed');
    expect(d.turns).toBe(proposedNew);
  });

  it('positionAt walks along the line', () => {
    const p = positionAt(oldCoords, 750);
    expect(p[0]).toBeCloseTo(at(500, 250)[0], 5);
    expect(p[1]).toBeCloseTo(at(500, 250)[1], 4);
  });
});
