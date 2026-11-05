import type { RouteData } from '../nav/types';

const W = 320;
const H = 90;
const PAD = { top: 8, right: 6, bottom: 18, left: 34 };

/** Small inline SVG elevation chart (no chart library). The summary text carries the meaning. */
export function ElevationProfile({ data }: { data: RouteData }) {
  const pts = data.profile;
  if (pts.length < 2) return null;
  const maxD = pts[pts.length - 1][0] || 1;
  const eles = pts.map((p) => p[1]);
  const lo = Math.floor(Math.min(...eles) / 10) * 10;
  const hi = Math.max(lo + 20, Math.ceil(Math.max(...eles) / 10) * 10);
  const x = (d: number) => PAD.left + (d / maxD) * (W - PAD.left - PAD.right);
  const y = (e: number) => PAD.top + (1 - (e - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const line = pts.map(([d, e], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)} ${y(e).toFixed(1)}`).join('');
  const area = `${line}L${x(maxD).toFixed(1)} ${y(lo)}L${x(0)} ${y(lo)}Z`;
  const { gainM, lossM, minEleM, maxEleM } = data.stats;
  const summary = `Elevation from ${minEleM} to ${maxEleM} metres, ${gainM} metres of climbing and ${lossM} metres of descent.`;
  const km = Math.floor(maxD / 1000);

  return (
    <figure className="profile">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <path className="profile__area" d={area} />
        <path className="profile__line" d={line} />
        <text className="profile__label" x={PAD.left - 4} y={y(hi) + 4} textAnchor="end">{hi} m</text>
        <text className="profile__label" x={PAD.left - 4} y={y(lo)} textAnchor="end">{lo} m</text>
        {Array.from({ length: km + 1 }, (_, k) => (
          <text key={k} className="profile__label" x={x(k * 1000)} y={H - 4} textAnchor="middle">
            {k}
          </text>
        ))}
      </svg>
      <figcaption>
        ↑ {gainM} m · ↓ {lossM} m · {minEleM}–{maxEleM} m (km along the bottom)
      </figcaption>
    </figure>
  );
}
