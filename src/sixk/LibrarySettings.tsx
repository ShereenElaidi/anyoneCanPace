import { useEffect, useRef } from 'react';
import type { RouteSummary } from '../nav/types';
import {
  availableFilters,
  clampPace,
  estimateTime,
  formatPace,
  PACE,
  PACE_PRESETS,
  spokenPace,
  type RouteFilter,
} from './describe';

interface Props {
  open: boolean;
  onClose: () => void;
  routes: RouteSummary[];
  pace: number;
  onPace: (secondsPerKm: number) => void;
  filter: RouteFilter;
  onFilter: (f: RouteFilter) => void;
}

/** Route Library settings: the pace behind the time estimates (saved) and which routes to show (this visit only). */
export function LibrarySettings({ open, onClose, routes, pace, onPace, filter, onFilter }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  const example = routes[0];
  const filters = availableFilters(routes);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby="library-settings-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet__body">
        <h2 id="library-settings-title" className="lib-settings__title">
          Library settings
        </h2>

        <section className="lib-settings__group" aria-labelledby="pace-label">
          <p id="pace-label" className="lib-settings__label">
            Your pace for time estimates
            <span className="lib-settings__sub">Saved on this phone</span>
          </p>
          <div className="pace-stepper">
            <button
              type="button"
              className="pace-stepper__btn"
              aria-label="Faster: 15 seconds less per km"
              onClick={() => onPace(clampPace(pace - PACE.step))}
            >
              −
            </button>
            <p className="pace-stepper__value" aria-live="polite">
              <span className="visually-hidden">{spokenPace(pace)}</span>
              <span aria-hidden="true">
                {formatPace(pace)}
                <small>/km</small>
              </span>
            </p>
            <button
              type="button"
              className="pace-stepper__btn"
              aria-label="Slower: 15 seconds more per km"
              onClick={() => onPace(clampPace(pace + PACE.step))}
            >
              +
            </button>
          </div>
          <div className="chips" role="group" aria-label="Common paces">
            {PACE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                aria-pressed={pace === p}
                aria-label={spokenPace(p)}
                onClick={() => onPace(p)}
              >
                {formatPace(p)}
              </button>
            ))}
          </div>
          <p className="lib-settings__hint">
            Run/walk groups are slower than their run pace, so pick the pace your group usually averages.
            {example && (
              <>
                {' '}
                Example: {example.name} takes <b>{estimateTime(example.stats.distanceM, pace).text}</b>.
              </>
            )}
          </p>
        </section>

        <section className="lib-settings__group" aria-labelledby="show-label">
          <p id="show-label" className="lib-settings__label">
            Show routes
            <span className="lib-settings__sub">Just for this visit. Next time you see them all.</span>
          </p>
          <div className="chips" role="group" aria-labelledby="show-label">
            {filters.map((f) => (
              <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
          DONE
        </button>
      </div>
    </dialog>
  );
}
