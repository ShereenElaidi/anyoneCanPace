import { lazy, Suspense } from 'react';
import { formatKm, turnPhrase } from '../nav/banner';
import { ElevationProfile } from './ElevationProfile';
import { activeAdvisories, type LoadedRoute } from './data';
import { KIND_LABEL } from './Library';
import { TurnIcon } from './TurnIcon';

const RouteMap = lazy(() => import('./map/RouteMap'));

interface Props {
  route: LoadedRoute;
  onStart: () => void;
}

export function RoutePage({ route, onStart }: Props) {
  const { data, track } = route;
  const advisories = activeAdvisories(data);
  return (
    <article className="route-page" aria-label={data.name}>
      <dl className="route-stats">
        <div>
          <dt>Distance</dt>
          <dd>{formatKm(data.stats.distanceM)}</dd>
        </div>
        <div>
          <dt>Climb</dt>
          <dd>↑ {data.stats.gainM} m</dd>
        </div>
        <div>
          <dt>Descent</dt>
          <dd>↓ {data.stats.lossM} m</dd>
        </div>
        <div>
          <dt>Shape</dt>
          <dd>{KIND_LABEL[data.kind]}</dd>
        </div>
      </dl>

      <div className="route-page__map">
        <Suspense fallback={<p className="route-map route-map--loading">Loading map…</p>}>
          <RouteMap track={track} bbox={data.bbox} label={`Map of ${data.name}`} />
        </Suspense>
      </div>

      <button type="button" className="btn btn--primary btn--block" onClick={onStart}>
        START ROUTE
      </button>

      <section aria-labelledby="profile-title">
        <h3 id="profile-title" className="sixk__h3">
          Elevation
        </h3>
        <ElevationProfile data={data} />
      </section>

      <section aria-labelledby="turns-title">
        <h3 id="turns-title" className="sixk__h3">
          Turns
        </h3>
        <ol className="turn-list">
          <li>
            <span className="turn-list__km">0.0 km</span>
            <TurnIcon icon="finish" className="turn-list__icon" />
            <span>Start{data.startStreet ? ` on ${data.startStreet}` : ''}</span>
          </li>
          {data.turns.map((t, i) => (
            <li key={i}>
              <span className="turn-list__km">{formatKm(t.atM)}</span>
              <TurnIcon icon={t.dir} className="turn-list__icon" />
              <span>
                {turnPhrase(t)}
                {t.note && <span className="turn-list__note">{t.note}</span>}
              </span>
            </li>
          ))}
          <li>
            <span className="turn-list__km">{formatKm(data.stats.distanceM)}</span>
            <TurnIcon icon="finish" className="turn-list__icon" />
            <span>Finish</span>
          </li>
        </ol>
      </section>

      {data.notes.length > 0 && (
        <section aria-labelledby="notes-title">
          <h3 id="notes-title" className="sixk__h3">
            Notes
          </h3>
          <ul className="plain-list">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="advisories-title">
        <h3 id="advisories-title" className="sixk__h3">
          Advisories
        </h3>
        {advisories.length === 0 ? (
          <p className="empty">No advisories for this route right now.</p>
        ) : (
          <ul className="plain-list">
            {advisories.map((a, i) => (
              <li key={i}>
                {a.text}
                {a.fromKm !== undefined && ` (km ${a.fromKm}${a.toKm !== undefined ? `–${a.toKm}` : ''})`}
                {a.source && (
                  <>
                    {' '}
                    <a href={a.source}>Source</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="credits">
        {data.source?.attribution ?? '© OpenStreetMap contributors'}. Map data © OpenStreetMap contributors, tiles by
        Protomaps.
      </p>
    </article>
  );
}
