/**
 * Deleting a route: shows every file that would go, what blocks it, and asks
 * for the route's name. The server checks everything again before moving the
 * files to .cache/route-editor-trash/ (ignored by git), so nothing is destroyed.
 */
import { useState } from 'react';
import { api, ApiError } from './client';
import type { DeletionPlan } from './deletion';
import { BuildLog, Errors, go, STATUS_TEXT } from './shared';
import type { BuildResult } from './types';
import type { VerificationStatus } from '../../nav/types';

export function DeletePanel({ id, dirty }: { id: string; dirty: boolean }) {
  const [plan, setPlan] = useState<DeletionPlan | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [build, setBuild] = useState<BuildResult>();
  const [done, setDone] = useState<{ trash: string; moved: string[] } | null>(null);

  const load = async () => {
    setErrors([]);
    try {
      setPlan(await api.deletionPlan(id));
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : [String(e)]);
    }
  };

  const remove = async () => {
    if (!plan) return;
    setBusy(true);
    setErrors([]);
    try {
      const r = await api.deleteRoute(id, name);
      setBuild(r.build);
      setDone(r);
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : [String(e)]);
      setBuild(e instanceof ApiError ? e.build : undefined);
      void load();
    }
    setBusy(false);
  };

  if (done) {
    return (
      <section className="re-group re-danger" aria-labelledby="re-delete">
        <h3 id="re-delete" className="re-h3">
          Deleted
        </h3>
        <div className="re-done" role="status">
          <p>
            {plan?.name} is gone from the library. Its {done.moved.length} files and the old config were moved to{' '}
            <code>{done.trash}</code>. Tracked files also come back with <code>git restore</code> until you commit.
          </p>
          <button type="button" className="btn btn--small" onClick={() => go('')}>
            ‹ BACK TO ROUTES
          </button>
        </div>
        <BuildLog build={build} />
      </section>
    );
  }

  const blocked = !plan || plan.references.length > 0 || plan.advisories.length > 0;
  return (
    <details className="re-group re-danger" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && !plan && void load()}>
      <summary>
        <h3 id="re-delete" className="re-h3">
          Delete this route
        </h3>
      </summary>
      {!plan && !errors.length && <p>Checking what would be removed…</p>}
      {plan && (
        <>
          <p>These files would be moved to <code>.cache/route-editor-trash/</code> (not destroyed):</p>
          <ul className="re-files">
            {plan.files.map((f) => (
              <li key={f}>
                <code>{f}</code>
                {plan.uncommitted.includes(f) ? ' · not in git' : ''}
              </li>
            ))}
            <li>
              its entry in <code>routes/routes.config.json</code> (a copy goes to the trash too)
            </li>
          </ul>
          {plan.sharedGpx && (
            <p className="re-hint">
              <code>{plan.sharedGpx}</code> stays: another route uses the same GPX.
            </p>
          )}
          {plan.uncommitted.length > 0 && (
            <p className="re-problem">
              {plan.uncommitted.length} of these files have changes that aren’t in git. After deleting, the trash folder is
              the only copy of them.
            </p>
          )}
          {plan.reviewed && (
            <p className="re-problem">
              This route is {STATUS_TEXT[plan.reviewed as VerificationStatus] ?? plan.reviewed}. If it comes back, it needs
              checking again. Also remove its line from the reviewed list in <code>src/nav/verification.test.ts</code>.
            </p>
          )}
          {plan.references.length > 0 && (
            <div className="re-errors">
              <p>
                <strong>Blocked:</strong> these lines name “{plan.id}”. Change them by hand first (often tests or the simulator
                that use this route).
              </p>
              <ul>
                {plan.references.slice(0, 12).map((r) => (
                  <li key={`${r.path}:${r.line}`}>
                    <code>
                      {r.path}:{r.line}
                    </code>{' '}
                    {r.text}
                  </li>
                ))}
                {plan.references.length > 12 && <li>…and {plan.references.length - 12} more.</li>}
              </ul>
            </div>
          )}
          {plan.advisories.length > 0 && (
            <div className="re-errors">
              <p>
                <strong>Blocked:</strong> <code>src/data/advisories.json</code> has advisories for this route:
              </p>
              <ul>
                {plan.advisories.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {!blocked && (
            <>
              {dirty && <p className="re-hint">Your unsaved changes above will be lost too.</p>}
              <label className="re-field">
                <span>Type the route’s name, “{plan.name}”, to confirm</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </label>
              <button
                type="button"
                className="btn btn--small btn--danger"
                disabled={busy || name !== plan.name}
                onClick={remove}
              >
                {busy ? 'DELETING…' : `DELETE ${plan.name.toUpperCase()}`}
              </button>
            </>
          )}
        </>
      )}
      <Errors errors={errors} />
      <BuildLog build={build} />
    </details>
  );
}
