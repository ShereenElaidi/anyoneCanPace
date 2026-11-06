/**
 * The turn editor: a map and the turn list side by side (stacked on a phone).
 * Click the route to add a turn, edit direction, street and note, move a turn
 * by its distance, or delete it. The build's suggestions and review flags are
 * shown next to each turn. Changes are saved with the rest of the route.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import type { LatLon } from '../../nav/geo';
import { prepareRoute } from '../../nav/route';
import type { RouteData, TrackFeature, Turn, TurnDir } from '../../nav/types';
import { turnPhrase } from '../../nav/banner';
import { TURN_DIRS, validateTurns } from './edits';
import { clickOptions, guessDir, insertTurn, normalizeTurns, notesForTurns, openSuggestions, type ClickOption } from './turnEdit';
import type { ReviewTurn } from './types';

const EditorMap = lazy(() => import('./EditorMap'));

const DIR_LABEL: Record<TurnDir, string> = {
  left: 'Left',
  right: 'Right',
  'slight-left': 'Bear left',
  'slight-right': 'Bear right',
  'sharp-left': 'Sharp left',
  'sharp-right': 'Sharp right',
  'u-turn': 'U-turn',
  straight: 'Straight on',
};

const kmText = (m: number) => `${(m / 1000).toFixed(2)} km`;

interface Props {
  data: RouteData;
  track: TrackFeature;
  candidates: ReviewTurn[];
  recorded: boolean;
  turns: Turn[];
  onChange: (turns: Turn[]) => void;
}

export function TurnEditor({ data, track, candidates, recorded, turns, onChange }: Props) {
  const route = useMemo(() => prepareRoute(track.geometry.coordinates), [track]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<{ options: ClickOption[] } | null>(null);
  const [message, setMessage] = useState('');
  const notes = notesForTurns(turns, candidates);
  const suggestions = openSuggestions(turns, candidates);
  const problems = validateTurns(normalizeTurns(turns), data.stats.distanceM);
  const flagged = notes.filter((n) => n?.needsReview).length;

  const add = (turn: Turn) => {
    const r = insertTurn(turns, turn);
    if ('error' in r) return setMessage(r.error);
    onChange(r.turns);
    setSelected(r.turns.indexOf(turn));
    setPending(null);
    setMessage(`Added ${DIR_LABEL[turn.dir].toLowerCase()} at ${kmText(turn.atM)}. Check the direction and add the street.`);
  };
  const update = (i: number, patch: Partial<Turn>) => {
    const next = turns.map((t, j) => (j === i ? { ...t, ...patch } : t));
    if (patch.note === '') delete next[i].note;
    onChange(next);
  };
  const move = (i: number, atM: number) => {
    const moved = { ...turns[i], atM };
    const next = turns.filter((_, j) => j !== i).concat(moved).sort((a, b) => a.atM - b.atM);
    onChange(next);
    setSelected(next.indexOf(moved));
  };
  const remove = (i: number) => {
    onChange(turns.filter((_, j) => j !== i));
    setSelected(null);
    setMessage(`Deleted turn ${i + 1}.`);
  };
  const onMapClick = (p: LatLon) => {
    setMessage('');
    setPending({ options: clickOptions(route, p) });
  };

  return (
    <section className="re-group" aria-labelledby="re-turns">
      <h3 id="re-turns" className="re-h3">
        Turns ({turns.length}){flagged > 0 && <span className="re-badge re-badge--unverified">{flagged} flagged by the build</span>}
      </h3>
      <p className="re-hint">
        Click the route on the map to add a turn; click a number to find a turn. Distances are along the route, from the start.
      </p>
      {recorded && (
        <p className="re-problem">Recorded run: GPS wobble can look like turns. Check every turn against the map closely.</p>
      )}

      <div className="re-turns-layout">
        <Suspense fallback={<p className="re-map re-map--loading">Loading map…</p>}>
          <EditorMap
            track={track}
            bbox={data.bbox}
            route={route}
            turns={turns}
            selected={selected}
            suggestions={suggestions}
            pending={pending?.options ?? []}
            onSelect={setSelected}
            onMapClick={onMapClick}
          />
        </Suspense>

        <div className="re-turns-side">
          {pending && (
            <div className="re-pending" role="status">
              {pending.options.length === 0 ? (
                <p>That click is more than 40 m from the route.</p>
              ) : (
                <>
                  <p>
                    {pending.options.length > 1
                      ? 'The route passes here more than once. Which time is the turn?'
                      : 'Add a turn here?'}
                  </p>
                  {pending.options.map((o) => {
                    const dir = guessDir(route, o.atM);
                    return (
                      <button
                        key={o.atM}
                        type="button"
                        className="btn btn--small"
                        onClick={() => add({ atM: o.atM, dir, street: '' })}
                      >
                        + {DIR_LABEL[dir]} at {kmText(o.atM)}
                      </button>
                    );
                  })}
                </>
              )}
              <button type="button" className="btn btn--small" onClick={() => setPending(null)}>
                CANCEL
              </button>
            </div>
          )}
          {message && (
            <p className="re-hint" role="status">
              {message}
            </p>
          )}

          {suggestions.length > 0 && (
            <details className="re-suggestions">
              <summary>
                {suggestions.length} build suggestion{suggestions.length > 1 ? 's' : ''} with no turn (the “?” on the map)
              </summary>
              <ul>
                {suggestions.map((s) => (
                  <li key={s.atM}>
                    <span>
                      <strong>
                        {kmText(s.atM)} · {DIR_LABEL[s.dir as TurnDir] ?? s.dir}
                        {s.streetAfter ? ` onto ${s.streetAfter}` : ''}
                      </strong>{' '}
                      ({s.decision}
                      {s.needsReview ? ', flagged' : ''}): {s.reason}
                    </span>
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => add({ atM: s.atM, dir: s.dir as TurnDir, street: s.streetAfter ?? '' })}
                    >
                      ADD
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="re-problem">
          {problems.slice(0, 3).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <ol className="re-turnlist">
        {turns.map((t, i) => {
          const note = notes[i];
          return (
            <li key={`${t.atM}:${i}`} className={i === selected ? 'is-selected' : undefined}>
              <div className="re-turnlist__head">
                <button
                  type="button"
                  className="re-num"
                  aria-label={`Show turn ${i + 1} on the map`}
                  aria-pressed={i === selected}
                  onClick={() => setSelected(i)}
                >
                  {i + 1}
                </button>
                <strong>{turnPhrase(t)}</strong>
                <span className="re-hint">{kmText(t.atM)}</span>
              </div>
              <div className="re-turnlist__fields">
                <label className="re-field">
                  <span>Metres from start</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={data.stats.distanceM}
                    defaultValue={t.atM}
                    onBlur={(e) => {
                      const v = Math.round(Number(e.target.value));
                      if (Number.isFinite(v) && v !== t.atM) move(i, v);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                </label>
                <label className="re-field">
                  <span>Direction</span>
                  <select value={t.dir} onChange={(e) => update(i, { dir: e.target.value as TurnDir })}>
                    {TURN_DIRS.map((d) => (
                      <option key={d} value={d}>
                        {DIR_LABEL[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="re-field">
                  <span>Street you turn onto</span>
                  <input value={t.street} onChange={(e) => update(i, { street: e.target.value })} />
                </label>
                <label className="re-field">
                  <span>Note (spoken after the turn)</span>
                  <input value={t.note ?? ''} onChange={(e) => update(i, { note: e.target.value })} />
                </label>
              </div>
              {note && (
                <p className={note.needsReview ? 're-problem' : 're-hint'}>
                  {note.needsReview ? '⚠ The build flagged this one: ' : 'Build: '}
                  {note.reason}
                  {note.suggested ? ` It would say “${note.suggested}”.` : ''}
                </p>
              )}
              <button type="button" className="btn btn--small btn--danger" onClick={() => remove(i)}>
                DELETE TURN {i + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
