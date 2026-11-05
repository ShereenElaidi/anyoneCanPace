import './notices.css';
import type { Notice } from './notices';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const asDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** "Nov 1 – Nov 30", "until Nov 6", "from Nov 1", or "". */
export function noticeDates(n: Notice): string {
  if (n.start && n.end) return `${dayFmt.format(asDate(n.start))} – ${dayFmt.format(asDate(n.end))}`;
  if (n.end) return `until ${dayFmt.format(asDate(n.end))}`;
  if (n.start) return `from ${dayFmt.format(asDate(n.start))}`;
  return '';
}

export function kmRange(n: Notice): string {
  if (n.fromKm === undefined) return '';
  return n.toKm === undefined ? `at km ${n.fromKm}` : `km ${n.fromKm}–${n.toKm}`;
}

const KIND_LABEL: Record<NonNullable<Notice['kind']>, string> = {
  manual: 'Notice',
  closure: 'Possible closure',
  'weather-warning': 'Weather warning',
};

interface Props {
  notices: Notice[];
  lastChecked: string;
  /** Route names by id, to label route notices on the dashboard. */
  routeNames?: Record<string, string>;
  empty: string;
}

/** Advisories as plain text: what, where, when, source, and when they were last checked. */
export function NoticeList({ notices, lastChecked, routeNames, empty }: Props) {
  return (
    <div className="notices">
      {notices.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="notices__list">
          {notices.map((n) => {
            const where = [routeNames && n.route !== 'global' ? routeNames[n.route] ?? n.route : '', kmRange(n)]
              .filter(Boolean)
              .join(', ');
            const when = noticeDates(n);
            return (
              <li key={`${n.route}:${n.id}`} className={`notice-item notice-item--${n.kind ?? 'manual'}`}>
                <span className="notice-item__kind">{KIND_LABEL[n.kind ?? 'manual']}</span>
                <p className="notice-item__text">{n.text}</p>
                {(where || when || n.source) && (
                  <p className="notice-item__meta">
                    {[where, when].filter(Boolean).join(' · ')}
                    {n.source && (
                      <>
                        {where || when ? ' · ' : ''}
                        <a href={n.source} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      </>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="notices__checked">Last checked {longFmt.format(asDate(lastChecked))}.</p>
    </div>
  );
}
