import { useCallback, useEffect, useRef, useState } from 'react';
import { describe as describeBanner, turnPhrase } from '../nav/banner';
import { STALE_CUE_MS } from '../nav/constants';
import type { PreparedRoute } from '../nav/route';
import { begin, createNav, goRogue, observe, update, type Fix, type NavEvent, type NavState } from '../nav/tracker';
import { navCueFor, playNavCue, vibrateNav, type NavCue } from '../lib/cues';

interface CueOptions {
  sound: boolean;
  vibration: boolean;
}

/**
 * React binding for the pure route tracker: feeds GPS fixes in, delivers cues
 * (vibration, beeps, screen-reader announcements) for fresh events only.
 */
export function useRouteNav(route: PreparedRoute, fix: Fix | null, cues: CueOptions, startStreet?: string) {
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
      let cue: NavCue | null = null;
      // Several events can arrive together (e.g. "started" and a first turn): say them all.
      const said: string[] = [];
      const announce = (text: string) => said.push(text);
      for (const e of events) {
        switch (e.kind) {
          case 'started':
            announce(e.anchored ? 'Route started.' : 'Route started. Waiting to find you on the route.');
            break;
          case 'joined':
            announce(`On the route at ${(e.progressM / 1000).toFixed(1)} kilometres.`);
            break;
          case 'turn': {
            const turn = route.turns[e.turnIndex];
            announce(
              e.stage === 'now'
                ? `${turnPhrase(turn)} now.`
                : describeBanner(route, next, startStreet).primary.replace(/ m$/, ' metres') + '.',
            );
            if (fresh(e.at)) cue = navCueFor(turn.dir);
            break;
          }
          case 'off-route':
            announce('Off route.');
            if (!next.rogue) setAskRogue(true);
            if (fresh(e.at)) cue = 'off-route';
            break;
          case 'back-on-route':
            setAskRogue(false);
            announce('Back on route.');
            break;
          case 'finished':
            setAskRogue(false);
            announce('Finished! Nice pacing.');
            if (fresh(e.at)) cue = 'finished';
            break;
          case 'turn-skipped':
            break;
        }
      }
      if (said.length) say(said.join(' '));
      if (cue) {
        if (cuesRef.current.vibration) vibrateNav(cue);
        if (cuesRef.current.sound) playNavCue(cue);
      }
    },
    [say, route, startStreet],
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

  const rogue = useCallback(() => {
    commit(goRogue(stateRef.current));
    setAskRogue(false);
  }, []);

  return {
    state,
    start,
    goRogue: rogue,
    askRogue,
    dismissRogue: () => setAskRogue(false),
    announcement,
  };
}
