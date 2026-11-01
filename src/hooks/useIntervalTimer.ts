import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSessionClock } from '../timer/clock';
import * as engine from '../timer/engine';
import type { Durations, Transition, TimerState } from '../timer/engine';

/** How often the display refreshes. Timing accuracy does not depend on it. */
const TICK_MS = 250;

/** A transition older than this was missed while suspended: no sound for it. */
const STALE_CUE_MS = 2000;

export type TimerEvent =
  | { kind: 'started' | 'paused' | 'resumed' | 'reset' }
  | { kind: 'phase'; phase: engine.Phase; fresh: boolean; skipped: boolean };

/**
 * React binding for the pure timer engine. Holds the state in a ref so
 * side effects (sounds, announcements) run exactly once per event, and
 * re-renders a few times a second while a session is active.
 */
export function useIntervalTimer(durations: Durations, onEvent: (event: TimerEvent) => void) {
  const clock = useMemo(() => createSessionClock(), []);
  const stateRef = useRef<TimerState>(engine.createReady(durations));
  const durationsRef = useRef(durations);
  const onEventRef = useRef(onEvent);
  const lastSkipRef = useRef(-Infinity);
  const [, setVersion] = useState(0);
  const [now, setNow] = useState(() => clock.now());

  onEventRef.current = onEvent;

  const commit = useCallback(
    (next: TimerState, at: number) => {
      stateRef.current = next;
      setNow(at);
      setVersion((v) => v + 1);
    },
    [],
  );

  /** Applies any interval boundaries that have passed and reports the latest one. */
  const catchUp = useCallback((): number => {
    const at = clock.now();
    const { state, transitions } = engine.sync(stateRef.current, durationsRef.current, at);
    if (transitions.length) {
      stateRef.current = state;
      const latest = transitions.at(-1) as Transition;
      const fresh = at - latest.at < STALE_CUE_MS && document.visibilityState === 'visible';
      onEventRef.current({ kind: 'phase', phase: latest.phase, fresh, skipped: false });
    }
    return at;
  }, [clock]);

  // Durations changed: future intervals use them; a ready display follows them.
  useEffect(() => {
    durationsRef.current = durations;
    const next = engine.withDurations(stateRef.current, durations);
    if (next !== stateRef.current) commit(next, clock.now());
  }, [durations, clock, commit]);

  const status = stateRef.current.status;

  useEffect(() => {
    if (status !== 'active') return;
    const tick = () => {
      const at = catchUp(); // must run before reading stateRef
      commit(stateRef.current, at);
    };
    const id = window.setInterval(tick, TICK_MS);
    // Returning from the background: resync immediately rather than on the next tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [status, catchUp, commit]);

  const startSession = useCallback(() => {
    const at = catchUp();
    const next = engine.start(stateRef.current, at);
    if (next === stateRef.current) return;
    commit(next, at);
    onEventRef.current({ kind: 'started' });
  }, [catchUp, commit]);

  const pauseSession = useCallback(() => {
    const at = catchUp();
    const next = engine.pause(stateRef.current, at);
    if (next === stateRef.current) return;
    commit(next, at);
    onEventRef.current({ kind: 'paused' });
  }, [catchUp, commit]);

  const resumeSession = useCallback(() => {
    const at = catchUp();
    const next = engine.resume(stateRef.current, at);
    if (next === stateRef.current) return;
    commit(next, at);
    onEventRef.current({ kind: 'resumed' });
  }, [catchUp, commit]);

  const skipInterval = useCallback(() => {
    const at = catchUp();
    // Swallow an accidental double tap so one press means one skip.
    if (at - lastSkipRef.current < 600) return;
    const next = engine.skip(stateRef.current, durationsRef.current, at);
    if (next === stateRef.current) return;
    lastSkipRef.current = at;
    commit(next, at);
    onEventRef.current({ kind: 'phase', phase: next.phase, fresh: true, skipped: true });
  }, [catchUp, commit]);

  const resetSession = useCallback(() => {
    commit(engine.createReady(durationsRef.current), clock.now());
    onEventRef.current({ kind: 'reset' });
  }, [clock, commit]);

  const state = stateRef.current;
  return {
    state,
    remainingMs: engine.remainingMs(state, now),
    start: startSession,
    pause: pauseSession,
    resume: resumeSession,
    skip: skipInterval,
    reset: resetSession,
  };
}
