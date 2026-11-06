import { useEffect, useRef } from 'react';
import type { RouteSummary } from '../nav/types';
import {
  availableFilters,
  estimateTime,
  formatPace,
  PACE_PRESETS,
  SORTS,
  spokenPace,
  isTestingRoute,
  type RouteFilter,
  type RouteSort,
  visibleRoutes,
} from './describe';

interface Props {
  open: boolean;
  onClose: () => void;
  routes: RouteSummary[];
  pace: number;
  onPace: (secondsPerKm: number) => void;
  /** Order of the list (saved). */
  sort: RouteSort;
  onSort: (s: RouteSort) => void;
  filter: RouteFilter;
  onFilter: (f: RouteFilter) => void;
  /** Routes tagged "Testing": off by default, for this visit only. */
  showTesting: boolean;
  onShowTesting: (show: boolean) => void;
}

/**
 * Route Library settings: the pace behind the time estimates and the list's order
 * (both saved), and which routes to show (this visit only).
 */
export function LibrarySettings({ open, onClose, routes, pace, onPace, sort, onSort, filter, onFilter, showTesting, onShowTesting }: Props) {
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
  const filters = availableFilters(visibleRoutes(routes, showTesting));
  const hasTesting = routes.some(isTestingRoute);

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
            <span className="lib-settings__sub">In minutes per km (min/km). Saved on this phone.</span>
          </p>
          <div className="chips" role="group" aria-labelledby="pace-label">
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

        <section className="lib-settings__group" aria-labelledby="sort-label">
          <p id="sort-label" className="lib-settings__label">
            Sort routes
            <span className="lib-settings__sub">Saved on this phone</span>
          </p>
          <div className="chips" role="group" aria-labelledby="sort-label">
            {SORTS.map((s) => (
              <button key={s.id} type="button" className="chip" aria-pressed={sort === s.id} onClick={() => onSort(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section className="lib-settings__group" aria-labelledby="show-label">
          <p id="show-label" className="lib-settings__label">
            Show routes
            <span className="lib-settings__sub">Just for this visit. Next time you see them all, except testing routes.</span>
          </p>
          <div className="chips" role="group" aria-labelledby="show-label">
            {filters.map((f) => (
              <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {hasTesting && (
            <>
              <div className="chips lib-settings__testing">
                <button type="button" className="chip" aria-pressed={showTesting} onClick={() => onShowTesting(!showTesting)}>
                  Testing routes
                </button>
              </div>
              <p className="lib-settings__hint">Routes still being tried out. Hidden unless this is on.</p>
            </>
          )}
        </section>

        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
          DONE
        </button>
      </div>
    </dialog>
  );
}
