import { describe, expect, it } from 'vitest';
import {
  clampSeconds,
  createReady,
  DEFAULT_DURATIONS,
  MAX_SECONDS,
  MIN_SECONDS,
  pause,
  remainingMs,
  resume,
  skip,
  start,
  sync,
  withDurations,
  type Durations,
  type TimerState,
} from './engine';

const D: Durations = { run: 90, walk: 60 };
const s = (seconds: number) => seconds * 1000;

function started(durations = D, at = 0): TimerState {
  return start(createReady(durations), at);
}

describe('ready state', () => {
  it('starts on RUN with the full configured RUN duration', () => {
    const state = createReady(D);
    expect(state).toMatchObject({ status: 'ready', phase: 'run', intervalMs: s(90), remainingMs: s(90) });
    expect(createReady(DEFAULT_DURATIONS).remainingMs).toBe(s(90));
  });

  it('follows RUN duration changes before the session starts', () => {
    expect(withDurations(createReady(D), { run: 60, walk: 60 }).remainingMs).toBe(s(60));
  });
});

describe('alternating intervals', () => {
  it('transitions RUN -> WALK -> RUN and keeps going', () => {
    let state = started();
    const phases: string[] = [];
    // 20 full cycles, sampled every 250 ms like the UI does.
    for (let t = 0; t <= s(150) * 20; t += 250) {
      const r = sync(state, D, t);
      state = r.state;
      for (const tr of r.transitions) phases.push(tr.phase);
    }
    expect(phases.slice(0, 4)).toEqual(['walk', 'run', 'walk', 'run']);
    expect(phases).toHaveLength(40);
    expect(state.phase).toBe('run');
  });

  it('switches to WALK exactly when RUN reaches zero', () => {
    const state = started();
    expect(sync(state, D, s(90) - 1).state.phase).toBe('run');
    const r = sync(state, D, s(90));
    expect(r.state.phase).toBe('walk');
    expect(r.transitions).toEqual([{ phase: 'walk', at: s(90) }]);
    expect(remainingMs(r.state, s(90))).toBe(s(60));
  });

  it('anchors each interval to the previous boundary, not to a late tick', () => {
    // The tick arrives 3.7 s late (throttled tab). WALK must still end at 150 s.
    const r = sync(started(), D, s(93.7));
    expect(r.state.endsAt).toBe(s(150));
    expect(remainingMs(r.state, s(93.7))).toBe(s(56.3));
  });

  it('accumulates no drift over a long session with irregular ticks', () => {
    let state = started();
    let t = 0;
    let seed = 7;
    const hours = 3;
    while (t < hours * 3600_000) {
      seed = (seed * 9301 + 49297) % 233280;
      t += 100 + (seed / 233280) * 4900; // jittery 0.1–5 s ticks
      state = sync(state, D, t).state;
    }
    // 3 h = 72 full 150 s cycles, so the boundaries are exact multiples of 150 s.
    const cyclePosition = t % s(150);
    const expectedPhase = cyclePosition < s(90) ? 'run' : 'walk';
    const expectedEnd = t - cyclePosition + (expectedPhase === 'run' ? s(90) : s(150));
    expect(state.phase).toBe(expectedPhase);
    expect(state.endsAt).toBe(expectedEnd);
  });
});

describe('recovering after suspension', () => {
  it('catches up on several missed transitions in one sync', () => {
    // Away for 7 minutes: 0-90 run, 90-150 walk, 150-240 run, 240-300 walk,
    // 300-390 run, 390-450 walk -> at 420 s we are in WALK with 30 s left.
    const r = sync(started(), D, s(420));
    expect(r.state.phase).toBe('walk');
    expect(remainingMs(r.state, s(420))).toBe(s(30));
    // Whole cycles may be collapsed, but the latest transition is always exact.
    expect(r.transitions.at(-1)).toEqual({ phase: 'walk', at: s(390) });
  });

  it('handles a suspension of many hours without iterating every interval', () => {
    const tenHours = 10 * 3600_000;
    const r = sync(started(), D, tenHours + s(100));
    // 10 h is 240 whole cycles, then 100 s into the next: WALK with 50 s left.
    expect(r.state.phase).toBe('walk');
    expect(remainingMs(r.state, tenHours + s(100))).toBe(s(50));
    expect(r.transitions.length).toBeLessThan(10);
  });
});

describe('pause and resume', () => {
  it('freezes the countdown and resumes from the remaining time', () => {
    let state = pause(started(), s(30));
    expect(state.status).toBe('paused');
    expect(remainingMs(state, s(30))).toBe(s(60));
    // Time passes while paused: nothing moves.
    expect(sync(state, D, s(500)).transitions).toEqual([]);
    expect(remainingMs(state, s(500))).toBe(s(60));
    state = resume(state, s(500));
    expect(remainingMs(state, s(510))).toBe(s(50));
    expect(sync(state, D, s(560)).state.phase).toBe('walk');
  });

  it('pausing right at a boundary does not lose the transition when synced first', () => {
    const synced = sync(started(), D, s(90)).state;
    const paused = pause(synced, s(90));
    expect(paused.phase).toBe('walk');
    expect(paused.remainingMs).toBe(s(60));
  });

  it('ignores repeated pause or resume taps', () => {
    const paused = pause(started(), s(10));
    expect(pause(paused, s(11))).toBe(paused);
    const resumed = resume(paused, s(20));
    expect(resume(resumed, s(21))).toBe(resumed);
    expect(start(resumed, s(22))).toBe(resumed);
  });
});

describe('skip', () => {
  it('jumps to the opposite phase with its full duration', () => {
    const state = skip(started(), D, s(20));
    expect(state.phase).toBe('walk');
    expect(remainingMs(state, s(20))).toBe(s(60));
    expect(sync(state, D, s(80)).state.phase).toBe('run');
  });

  it('keeps a paused session paused at the start of the next phase', () => {
    const state = skip(pause(started(), s(20)), D, s(25));
    expect(state).toMatchObject({ status: 'paused', phase: 'walk', remainingMs: s(60), endsAt: null });
  });

  it('does nothing before the session starts', () => {
    const ready = createReady(D);
    expect(skip(ready, D, 0)).toBe(ready);
  });
});

describe('changing durations mid-session', () => {
  it('leaves the current RUN alone and uses the new RUN next time', () => {
    let state = started();
    const shorter: Durations = { run: 60, walk: 60 };
    state = withDurations(state, shorter);
    expect(state.endsAt).toBe(s(90)); // current RUN unchanged
    state = sync(state, shorter, s(90)).state; // WALK 90-150
    state = sync(state, shorter, s(150)).state; // next RUN
    expect(state.phase).toBe('run');
    expect(state.intervalMs).toBe(s(60));
    expect(state.endsAt).toBe(s(210));
  });

  it('changing WALK while running affects the upcoming WALK', () => {
    const longer: Durations = { run: 90, walk: 120 };
    const state = sync(withDurations(started(), longer), longer, s(90)).state;
    expect(state.phase).toBe('walk');
    expect(state.intervalMs).toBe(s(120));
  });

  it('does not change a paused interval', () => {
    const paused = pause(started(), s(30));
    expect(withDurations(paused, { run: 15, walk: 15 })).toBe(paused);
  });
});

describe('duration limits', () => {
  it('clamps to 15 s – 30 min', () => {
    expect(clampSeconds(0)).toBe(MIN_SECONDS);
    expect(clampSeconds(-30)).toBe(MIN_SECONDS);
    expect(clampSeconds(5000)).toBe(MAX_SECONDS);
    expect(clampSeconds(Number.NaN)).toBe(MIN_SECONDS);
    expect(clampSeconds(75)).toBe(75);
  });

  it('never runs an interval outside the limits even with bad input', () => {
    expect(createReady({ run: 3, walk: 99999 }).intervalMs).toBe(s(MIN_SECONDS));
    const r = sync(started({ run: 3, walk: 99999 }), { run: 3, walk: 99999 }, s(15));
    expect(r.state.intervalMs).toBe(s(MAX_SECONDS));
  });
});
