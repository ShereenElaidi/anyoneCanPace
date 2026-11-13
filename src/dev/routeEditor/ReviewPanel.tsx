/**
 * Marking a route reviewed: who, when, and an explicit confirmation of what
 * was checked. Saved on its own (not with other edits), so a review is always
 * of the turns already saved. The editor never edits the reviewed list in
 * src/nav/verification.test.ts: it shows the line to add, so the review stays
 * a visible change in the pull request.
 */
import { useState } from 'react';
import type { RouteData, VerificationStatus } from '../../nav/types';
import { verificationText } from '../../nav/verification';
import { api, ApiError } from './client';
import { REVIEW_CHECK, reviewedListLine, reviewRecord, type ReviewedStatus } from './review';
import { BuildLog, Errors, STATUS_TEXT, StatusBadge } from './shared';
import type { BuildResult } from './types';

interface Props {
  data: RouteData;
  today: string;
  /** Other unsaved edits on the page: a review has to wait for them. */
  dirty: boolean;
  onSaved: () => Promise<void> | void;
}

export function ReviewPanel({ data, today, dirty, onSaved }: Props) {
  const current = data.verification;
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [reviewer, setReviewer] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [build, setBuild] = useState<BuildResult>();
  const [listLine, setListLine] = useState('');

  const reviewed = status !== null && status !== 'unverified';
  const ready =
    !dirty && !busy && status !== null && (!reviewed || (!!reviewer.trim() && !!date && date <= today && checked));

  const save = async () => {
    if (!status) return;
    setBusy(true);
    setErrors([]);
    setListLine('');
    const verification = reviewRecord(status, reviewer, date, notes);
    try {
      const r = await api.saveRoute(data.id, { verification });
      setBuild(r.build);
      if (verification.status !== 'unverified') setListLine(reviewedListLine(data.id, verification));
      setStatus(null);
      setChecked(false);
      await onSaved();
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : [String(e)]);
      setBuild(e instanceof ApiError ? e.build : undefined);
    }
    setBusy(false);
  };

  return (
    <section className="re-group" aria-labelledby="re-review">
      <h3 id="re-review" className="re-h3">
        Review <StatusBadge status={current.status} />
      </h3>
      <p className="re-hint">
        Pacers see: “{verificationText(current).detail}”{current.notes ? ` Note: ${current.notes}` : ''}
      </p>
      {dirty && <p className="re-problem">Save or undo your other changes first: a review is of the saved route.</p>}

      <div className="re-radios" role="radiogroup" aria-label="New status">
        {(['desk-reviewed', 'field-verified', 'unverified'] as const).map((s) => (
          <label key={s} className="re-radio re-radio--box">
            <input
              type="radio"
              name="review-status"
              disabled={dirty}
              checked={status === s}
              onChange={() => {
                setStatus(s);
                setChecked(false);
              }}
            />
            <span>{STATUS_TEXT[s]}</span>
          </label>
        ))}
      </div>

      {reviewed && (
        <>
          <label className="re-field">
            <span>Reviewer (a person, or e.g. “Crew run (Les Stooopids)”)</span>
            <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </label>
          <label className="re-field">
            <span>Date of the check</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="re-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>{REVIEW_CHECK[status as ReviewedStatus].replace('<id>', data.id)}</span>
          </label>
        </>
      )}
      {status && (
        <label className="re-field">
          <span>Notes (optional, shown to pacers)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      )}
      {status && (
        <button type="button" className="btn btn--small" disabled={!ready} onClick={save}>
          {busy ? 'SAVING…' : status === 'unverified' ? 'SET BACK TO UNVERIFIED' : `MARK ${STATUS_TEXT[status].toUpperCase()}`}
        </button>
      )}

      <Errors errors={errors} />
      {listLine && (
        <div className="re-done" role="status">
          <p>
            Saved. One more step, by hand: add this line to the <code>reviewed</code> list in{' '}
            <code>src/nav/verification.test.ts</code>, or <code>npm test</code> fails. It makes the review a visible change in the
            pull request.
          </p>
          <pre className="re-code">{listLine}</pre>
          <button type="button" className="btn btn--small" onClick={() => void navigator.clipboard?.writeText(listLine)}>
            COPY LINE
          </button>
        </div>
      )}
      <BuildLog build={build} />
    </section>
  );
}
