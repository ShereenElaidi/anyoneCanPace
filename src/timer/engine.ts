/**
 * Pure, timestamp-based RUN/WALK interval engine.
 *
 * Nothing here reads a clock or schedules work. Every function receives `now`
 * (milliseconds from the session clock, see clock.ts) and returns new state.
 * While a session is active we only store the moment the current interval
 * ends (`endsAt`); remaining time is always derived as `endsAt - now`, so a
 * late, throttled or skipped tick can never make the countdown drift.
 */

export type Phase = 'run' | 'walk';
export type Status = 'ready' | 'active' | 'paused';

/** Configured interval lengths, in whole seconds. */
export interface Durations {
  run: number;
  walk: number;
}

export interface TimerState {
  status: Status;
  phase: Phase;
  /** Full length of the current interval (fixed when the interval starts). */
  intervalMs: number;
  /** Remaining time while ready or paused. Ignored while active. */
  remainingMs: number;
  /** Clock time at which the current interval ends. Only set while active. */
  endsAt: number | null;
}

export interface Transition {
  /** The phase that started. */
  phase: Phase;
  /** Clock time at which it started. */
  at: number;
}

export const MIN_SECONDS = 15;
export const MAX_SECONDS = 30 * 60;
export const STEP_SECONDS = 15;
export const DEFAULT_DURATIONS: Durations = { run: 90, walk: 60 };

export const otherPhase = (phase: Phase): Phase => (phase === 'run' ? 'walk' : 'run');

export function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)));
}

const durationMs = (durations: Durations, phase: Phase) => clampSeconds(durations[phase]) * 1000;

/** A stopped session, sitting at the start of a full RUN interval. */
export function createReady(durations: Durations): TimerState {
  const ms = durationMs(durations, 'run');
  return { status: 'ready', phase: 'run', intervalMs: ms, remainingMs: ms, endsAt: null };
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.status !== 'active' || state.endsAt === null) return state.remainingMs;
  return Math.max(0, state.endsAt - now);
}

/**
 * Brings an active session up to `now`, applying every interval boundary that
 * has passed (there can be several after the page was suspended). Each new
 * interval starts exactly where the previous one ended, not at `now`, so time
 * spent in the background is accounted for precisely.
 */
export function sync(
  state: TimerState,
  durations: Durations,
  now: number,
): { state: TimerState; transitions: Transition[] } {
  if (state.status !== 'active' || state.endsAt === null || now < state.endsAt) {
    return { state, transitions: [] };
  }

  let { phase, endsAt, intervalMs } = state;
  const transitions: Transition[] = [];

  // After a very long suspension, skip whole RUN+WALK cycles in one step.
  // A full cycle returns to the same phase, so the result is unchanged.
  const cycleMs = durationMs(durations, 'run') + durationMs(durations, 'walk');
  const behind = now - endsAt;
  if (behind > cycleMs * 2) {
    endsAt += (Math.floor(behind / cycleMs) - 1) * cycleMs;
  }

  while (now >= endsAt) {
    const startedAt = endsAt;
    phase = otherPhase(phase);
    intervalMs = durationMs(durations, phase);
    endsAt = startedAt + intervalMs;
    transitions.push({ phase, at: startedAt });
  }

  return {
    state: { ...state, phase, intervalMs, endsAt, remainingMs: endsAt - now },
    transitions,
  };
}

export function start(state: TimerState, now: number): TimerState {
  if (state.status !== 'ready') return state;
  return { ...state, status: 'active', endsAt: now + state.remainingMs };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'active') return state;
  return { ...state, status: 'paused', remainingMs: remainingMs(state, now), endsAt: null };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused') return state;
  return { ...state, status: 'active', endsAt: now + state.remainingMs };
}

/**
 * Jumps straight to the start of the opposite phase with its full configured
 * duration. A paused session stays paused, ready to resume into the new phase.
 */
export function skip(state: TimerState, durations: Durations, now: number): TimerState {
  if (state.status === 'ready') return state;
  const phase = otherPhase(state.phase);
  const intervalMs = durationMs(durations, phase);
  return {
    ...state,
    phase,
    intervalMs,
    remainingMs: intervalMs,
    endsAt: state.status === 'active' ? now + intervalMs : null,
  };
}

/**
 * New durations take effect at the next occurrence of each phase. The running
 * interval is never touched, except before a session starts, where the
 * ready display simply follows the configured RUN duration.
 */
export function withDurations(state: TimerState, durations: Durations): TimerState {
  return state.status === 'ready' ? createReady(durations) : state;
}
