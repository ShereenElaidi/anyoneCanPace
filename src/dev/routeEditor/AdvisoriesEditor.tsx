/** A route's own advisories (works, closures, seasonal notes), saved with the rest of the route. */
import { formatKm } from '../../nav/banner';
import { validateAdvisories } from './edits';
import { emptyAdvisory, formToAdvisory, type AdvisoryForm } from './review';

interface Props {
  routeId: string;
  distanceM: number;
  today: string;
  advisories: AdvisoryForm[];
  onChange: (advisories: AdvisoryForm[]) => void;
}

export function AdvisoriesEditor({ routeId, distanceM, today, advisories, onChange }: Props) {
  const problems = validateAdvisories(advisories.map(formToAdvisory), routeId, distanceM, today);
  const update = (i: number, patch: Partial<AdvisoryForm>) =>
    onChange(advisories.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <section className="re-group" aria-labelledby="re-advisories">
      <h3 id="re-advisories" className="re-h3">
        Advisories ({advisories.length})
      </h3>
      <p className="re-hint">
        Shown on the route page and the dashboard while active. Leave the dates empty for “until removed”, and the km empty for
        the whole route ({formatKm(distanceM)}).
      </p>
      {advisories.map((a, i) => (
        <fieldset key={i} className="re-tagform">
          <legend>Advisory {i + 1}</legend>
          <label className="re-field">
            <span>Text</span>
            <input value={a.text} onChange={(e) => update(i, { text: e.target.value })} placeholder="Canal path closed for works" />
          </label>
          <div className="re-turnlist__fields">
            <label className="re-field">
              <span>From km</span>
              <input inputMode="decimal" value={a.fromKm} onChange={(e) => update(i, { fromKm: e.target.value })} />
            </label>
            <label className="re-field">
              <span>To km</span>
              <input inputMode="decimal" value={a.toKm} onChange={(e) => update(i, { toKm: e.target.value })} />
            </label>
            <label className="re-field">
              <span>Starts</span>
              <input type="date" value={a.start} onChange={(e) => update(i, { start: e.target.value })} />
            </label>
            <label className="re-field">
              <span>Ends</span>
              <input type="date" value={a.end} onChange={(e) => update(i, { end: e.target.value })} />
            </label>
          </div>
          <label className="re-field">
            <span>Source link (optional)</span>
            <input value={a.source} onChange={(e) => update(i, { source: e.target.value })} placeholder="https://montreal.ca/…" />
          </label>
          <button
            type="button"
            className="btn btn--small btn--danger"
            onClick={() => onChange(advisories.filter((_, j) => j !== i))}
          >
            DELETE ADVISORY {i + 1}
          </button>
        </fieldset>
      ))}
      {problems.length > 0 && (
        <ul className="re-problem">
          {problems.slice(0, 3).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn--small" onClick={() => onChange([...advisories, { ...emptyAdvisory }])}>
        + ADD AN ADVISORY
      </button>
    </section>
  );
}
