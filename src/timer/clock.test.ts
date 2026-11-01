import { describe, expect, it } from 'vitest';
import { createSessionClock } from './clock';

function fakeClocks() {
  const t = { mono: 1000, wall: 1_700_000_000_000 };
  const clock = createSessionClock(
    () => t.mono,
    () => t.wall,
  );
  return { t, clock };
}

describe('session clock', () => {
  it('follows the monotonic clock while awake', () => {
    const { t, clock } = fakeClocks();
    const a = clock.now();
    t.mono += 5000;
    t.wall += 5000;
    expect(clock.now() - a).toBe(5000);
  });

  it('ignores the wall clock jumping backwards', () => {
    const { t, clock } = fakeClocks();
    const a = clock.now();
    t.mono += 2000;
    t.wall -= 3_600_000; // daylight saving / manual change
    expect(clock.now() - a).toBe(2000);
  });

  it('adds time the device slept when the monotonic clock paused', () => {
    const { t, clock } = fakeClocks();
    const a = clock.now();
    t.mono += 10; // monotonic clock stopped during sleep
    t.wall += 120_000;
    expect(clock.now() - a).toBe(120_000);
    // And keeps counting normally afterwards.
    t.mono += 1000;
    t.wall += 1000;
    expect(clock.now() - a).toBe(121_000);
  });

  it('tolerates small disagreements between the two clocks', () => {
    const { t, clock } = fakeClocks();
    const a = clock.now();
    t.mono += 1000;
    t.wall += 1400;
    expect(clock.now() - a).toBe(1000);
  });
});
