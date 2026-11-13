/** Small pieces shared by the route editor's screens. */
import type { BuildResult } from './types';
import type { VerificationStatus } from '../../nav/types';
import { formatKm } from '../../nav/banner';

export const STATUS_TEXT: Record<VerificationStatus, string> = {
  unverified: 'Unverified',
  'desk-reviewed': 'Desk-reviewed',
  'field-verified': 'Field-verified',
};

export function StatusBadge({ status }: { status: VerificationStatus | null }) {
  if (!status) return <span className="re-badge re-badge--missing">Not built</span>;
  return (
    <span className={`re-badge re-badge--${status}`}>
      {status === 'unverified' ? '⚠ ' : '✓ '}
      {STATUS_TEXT[status]}
    </span>
  );
}

export function km(m: number | null): string {
  return m === null ? '–' : formatKm(m);
}

/** Problems from the server, as a list a screen reader announces. */
export function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="re-errors" role="alert">
      <p>
        <strong>Not saved:</strong>
      </p>
      <ul>
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

/** The output of `npm run routes`, folded away unless the build failed. */
export function BuildLog({ build }: { build: BuildResult | undefined }) {
  if (!build) return null;
  return (
    <details className="re-log" open={!build.ok}>
      <summary>{build.ok ? 'Build log (npm run routes)' : 'The build failed: log'}</summary>
      <pre>{build.log || '(no output)'}</pre>
    </details>
  );
}

export function go(hash: string) {
  location.hash = hash;
}

let leaveGuard: (() => boolean) | null = null;

/** While a screen has unsaved changes: asks before the editor navigates away. Returns a release function. */
export function setLeaveGuard(guard: () => boolean): () => void {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
}

/** True when navigation may go ahead (no guard, or the person agreed to leave). */
export function mayLeave(): boolean {
  return leaveGuard ? leaveGuard() : true;
}
