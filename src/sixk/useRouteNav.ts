import { useCallback, useEffect, useRef, useState } from 'react';
import { STALE_CUE_MS } from '../nav/constants';
import type { PreparedRoute } from '../nav/route';
import { begin, createNav, goRogue, joinAt, observe, update, type Fix, type NavEvent, type NavState } from '../nav/tracker';
import { playNavCue, vibrateNav } from '../lib/cues';
import { planDelivery } from './navDelivery';

interface CueOptions {
  sound: boolean;
  vibration: boolean;
}

/**
 * React binding for the pure route tracker: feeds GPS fixes in, delivers cues
 * (vibration, beeps, screen-reader announcements) for fresh events only.
 */
export function useRouteNav(route: PreparedRoute, fix: Fix | null, cues: CueOptions) {
  const [state, setState] = useState<NavState>(() => createNav(route));
  const stateRef = useRef(state);
  const cuesRef = useRef(cues);
  const [announcement, setAnnouncement] = useState('');
  const [askRogue, setAskRogue] = useState(false);
  cuesRef.current = cues;

  const say = useCallback((text: string) => {
    setAnnouncement((prev) => (prev === text ? `${text} ` : text));
  }, []);

  const deliver = useCallback(
    (events: NavEvent[], next: NavState) => {
      const now = Date.now();
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      // Missed cues are never replayed: only buzz for something that just happened while visible.
      const fresh = (at: number) => visible && now - at < STALE_CUE_MS;
      for (const e of events) {
        if (e.kind === 'off-route' && !next.rogue) setAskRogue(true);
        if (e.kind === 'back-on-route' || e.kind === 'finished') setAskRogue(false);
      }
      // One cue per batch (an immediate turn beats a later heads-up), and text from each event.
      const { text, cue } = planDelivery(route, events);
      if (text) say(text);
      if (cue && fresh(cue.at)) {
        if (cuesRef.current.vibration) vibrateNav(cue.cue);
        if (cuesRef.current.sound) playNavCue(cue.cue);
      }
    },
    [say, route],
  );

  const commit = (next: NavState) => {
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    if (!fix) return;
    const current = stateRef.current;
    if (current.status === 'approach') {
      commit(observe(current, fix));
      return;
    }
    const r = update(route, current, fix);
    commit(r.state);
    deliver(r.events, r.state);
  }, [fix, route, deliver]);

  const start = useCallback(() => {
    const r = begin(route, stateRef.current, null, Date.now());
    commit(r.state);
    deliver(r.events, r.state);
  }, [route, deliver]);

  /** Explicitly join the route at one of the places it passes near you. */
  const join = useCallback(
    (alongM: number) => {
      const r = joinAt(route, stateRef.current, alongM);
      commit(r.state);
      deliver(r.events, r.state);
    },
    [route, deliver],
  );

  const rogue = useCallback(() => {
    commit(goRogue(stateRef.current));
    setAskRogue(false);
  }, []);

  return {
    state,
    start,
    join,
    goRogue: rogue,
    askRogue,
    dismissRogue: () => setAskRogue(false),
    announcement,
  };
}
