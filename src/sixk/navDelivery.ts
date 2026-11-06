/**
 * What to say and which single cue to play for a batch of navigation events
 * (one GPS fix can produce several). Pure, so the priorities are testable.
 *
 * - One cue per batch, by priority: finished, a turn "now", off route, a heads-up.
 *   A later heads-up never replaces an immediate manoeuvre.
 * - Every announcement comes from its own event (its turn and its distance),
 *   never from whatever the banner shows afterwards.
 * - A turn "now" with the next turn close behind is said as one instruction:
 *   "Left on Rue A now, then right on Rue B in 60 metres."
 */
import { formatDistance, turnPhrase } from '../nav/banner';
import type { PreparedRoute } from '../nav/route';
import type { Turn } from '../nav/types';
import type { NavEvent } from '../nav/tracker';
import { navCueFor, type NavCue } from '../lib/cues';

/** "Left on Rue A now", or a landmark's name alone. */
const spokenNow = (t: Turn) => (t.dir === 'landmark' ? turnPhrase(t) : `${turnPhrase(t)} now`);

/** A following turn this close after a "now" turn is folded into the same announcement. */
export const COMPOSE_NEXT_TURN_M = 150;

export interface Delivery {
  /** Screen-reader text for the whole batch ('' if nothing to say). */
  text: string;
  /** The single cue to buzz/beep, with the time of the event it belongs to. */
  cue: { cue: NavCue; at: number } | null;
}

/** "150 m" → "150 metres", "1.2 km" → "1.2 kilometres". */
export const spokenDistance = (m: number) =>
  formatDistance(m)
    .replace(/ m$/, ' metres')
    .replace(/ km$/, ' kilometres');

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const PRIORITY: Record<string, number> = { finished: 0, now: 1, 'off-route': 2, 'heads-up': 3 };

export function planDelivery(route: PreparedRoute, events: NavEvent[]): Delivery {
  const said: string[] = [];
  let cue: (Delivery['cue'] & { rank: number }) | null = null;
  const offer = (c: NavCue, at: number, rank: number) => {
    if (!cue || rank < cue.rank) cue = { cue: c, at, rank };
  };
  // Heads-ups already folded into a "now" announcement.
  const folded = new Set<number>();

  for (const e of events) {
    switch (e.kind) {
      case 'started':
        said.push(e.anchored ? 'Route started.' : 'Route started. Waiting to find you on the route.');
        break;
      case 'joined':
        said.push(`On the route at ${(e.progressM / 1000).toFixed(1)} kilometres.`);
        break;
      case 'turn': {
        const turn = route.turns[e.turnIndex];
        if (!turn) break;
        if (e.stage === 'now') {
          const next = events.find(
            (o): o is Extract<NavEvent, { kind: 'turn' }> =>
              o.kind === 'turn' && o.stage === 'heads-up' && o.turnIndex === e.turnIndex + 1,
          );
          const nextTurn = next ? route.turns[next.turnIndex] : undefined;
          const gap = nextTurn ? nextTurn.atM - turn.atM : Infinity;
          if (next && nextTurn && gap <= COMPOSE_NEXT_TURN_M) {
            folded.add(next.turnIndex);
            said.push(`${spokenNow(turn)}, then ${lowerFirst(turnPhrase(nextTurn))} in ${spokenDistance(gap)}.`);
          } else {
            said.push(`${spokenNow(turn)}.`);
          }
          offer(navCueFor(turn.dir), e.at, PRIORITY.now);
        } else {
          if (folded.has(e.turnIndex)) break;
          said.push(`${turnPhrase(turn)} in ${spokenDistance(e.distanceM)}.`);
          offer(navCueFor(turn.dir), e.at, PRIORITY['heads-up']);
        }
        break;
      }
      case 'off-route':
        said.push('Off route.');
        offer('off-route', e.at, PRIORITY['off-route']);
        break;
      case 'back-on-route':
        said.push('Back on route.');
        break;
      case 'finished':
        said.push('Finished! Nice pacing.');
        offer('finished', e.at, PRIORITY.finished);
        break;
      case 'turn-skipped':
        break;
    }
  }
  const chosen = cue as (Delivery['cue'] & { rank: number }) | null;
  return { text: said.join(' '), cue: chosen ? { cue: chosen.cue, at: chosen.at } : null };
}
