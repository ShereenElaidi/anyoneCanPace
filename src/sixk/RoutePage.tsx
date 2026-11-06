import { Lazy } from '../components/LoadBoundary';
import { formatKm, turnPhrase } from '../nav/banner';
import { ElevationProfile } from './ElevationProfile';
import advisoriesFile from '../data/advisories.json';
import { NoticeList } from '../advisories/NoticeList';
import { activeNotices, collectNotices, routeNotices, type NoticeFile } from '../advisories/notices';
import { localDate } from '../weather/runTime';
import type { LoadedRoute } from './data';
import { KIND_LABEL } from './Library';
import { TurnIcon } from './TurnIcon';
import { verificationText } from '../nav/verification';

const loadRouteMap = () => import('./map/RouteMap');

interface Props {
  route: LoadedRoute;
  onStart: () => void;
}

export function RoutePage({ route, onStart }: Props) {
  const { data, track } = route;
  const file = advisoriesFile as NoticeFile;
  const notices = activeNotices(collectNotices(file.notices, routeNotices(data)), data.id, localDate(Date.now()));
  return (
    <article className="route-page" aria-label={data.name}>
      {data.description && <p className="route-page__description">{data.description}</p>}

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
        <Lazy
          load={loadRouteMap}
          props={{ track, bbox: data.bbox, label: `Map of ${data.name}` }}
          loading={<p className="route-map route-map--loading">Loading map…</p>}
          failed={(retry) => (
            <div className="route-map route-map--failed" role="note">
              <p>The map didn’t load. You can still start the route.</p>
              <button type="button" className="btn btn--secondary btn--small" onClick={retry}>
                TRY MAP AGAIN
              </button>
            </div>
          )}
        />
      </div>

      <VerificationNote data={data} />

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
        <NoticeList notices={notices} lastChecked={file.lastChecked} empty="No advisories for this route right now." />
      </section>

      <p className="credits">
        {data.source?.attribution ?? '© OpenStreetMap contributors'}. Map data © OpenStreetMap contributors, tiles by
        Protomaps.
      </p>
    </article>
  );
}

/** Before navigating: has anyone checked these directions? Shown as text, not just colour. */
function VerificationNote({ data }: { data: LoadedRoute['data'] }) {
  const v = data.verification ?? { status: 'unverified' as const };
  const { label, detail } = verificationText(v);
  return (
    <section
      className={`verify-note verify-note--${v.status}`}
      aria-label={`Directions: ${label}`}
      role={v.status === 'unverified' ? 'note' : undefined}
    >
      <p className="verify-note__label">
        {v.status === 'unverified' ? '⚠ ' : '✓ '}
        {label} directions
      </p>
      <p>{detail}</p>
      {v.notes && <p className="verify-note__extra">{v.notes}</p>}
    </section>
  );
}
