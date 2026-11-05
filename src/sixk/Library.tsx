import { useEffect } from 'react';
import { formatKm } from '../nav/banner';
import type { RouteKind, RouteSummary } from '../nav/types';
import { verificationText } from '../nav/verification';
import { manifest } from './data';
import { mapStatusText, saveMap, shouldAutoSave, useOfflineMap } from './map/offlineMap';

export const KIND_LABEL: Record<RouteKind, string> = {
  loop: 'Loop',
  'out-and-back': 'Out and back',
  'point-to-point': 'Point to point',
};

interface Props {
  onOpen: (id: string) => void;
}

export function Library({ onOpen }: Props) {
  return (
    <>
      <OfflineMapCard />
      <section aria-labelledby="routes-title">
        <h2 id="routes-title" className="sixk__h2">
          Routes
        </h2>
        {manifest.routes.length === 0 ? (
          <p>No routes yet.</p>
        ) : (
          <ul className="route-list">
            {manifest.routes.map((r) => (
              <li key={r.id}>
                <RouteCard route={r} onOpen={() => onOpen(r.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RouteCard({ route, onOpen }: { route: RouteSummary; onOpen: () => void }) {
  const { distanceM, gainM, lossM } = route.stats;
  return (
    <button type="button" className="route-card" onClick={onOpen}>
      <svg className="route-card__thumb" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path d={route.outline} />
      </svg>
      <span className="route-card__text">
        <span className="route-card__name">{route.name}</span>
        <span className="route-card__stats">
          {formatKm(distanceM)} · ↑ {gainM} m ↓ {lossM} m · {KIND_LABEL[route.kind]}
        </span>
        <span className={`route-card__check route-card__check--${route.verification}`}>
          {route.verification === 'unverified' ? '⚠ ' : '✓ '}
          {verificationText({ status: route.verification }).label} directions
        </span>
        <span className="visually-hidden">
          {`. Climb ${gainM} metres, descent ${lossM} metres.`}
        </span>
      </span>
      <span className="route-card__go" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** Honest offline status for the street map, with a way to save it. */
export function OfflineMapCard() {
  const status = useOfflineMap();

  // Save automatically the first time, unless offline or in data-saver mode.
  const outdated = status.state === 'saved' && !!status.outdated;
  useEffect(() => {
    if ((status.state === 'missing' || outdated) && shouldAutoSave()) void saveMap();
  }, [status.state, outdated]);

  const canSave = status.state === 'missing' || status.state === 'error' || outdated;
  return (
    <section className={`map-status map-status--${status.state}`} aria-live="polite">
      <p>
        <span className="map-status__tag">{status.state === 'saved' && !outdated ? 'OFFLINE ✓' : 'MAP'}</span> {mapStatusText(status)}
      </p>
      {status.state === 'saving' && (
        <progress max={1} value={status.fraction ?? undefined} aria-label="Map download progress" />
      )}
      {canSave && (
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void saveMap()}>
          {outdated ? 'UPDATE OFFLINE MAP' : 'SAVE MAP FOR OFFLINE'}
        </button>
      )}
    </section>
  );
}
