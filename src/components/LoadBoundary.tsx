import { Component, lazy, Suspense, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { reloadIfIdle } from '../lib/swUpdate';

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;

class Boundary extends Component<{ resetKey: number; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Part of the app failed to load', error);
  }

  componentDidUpdate(prev: { resetKey: number }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * A lazily loaded part of the app that never leaves a blank screen. If its code
 * can't be fetched (offline before it was cached, or an update replaced it) or
 * it throws while rendering, `failed(retry)` is shown instead, and `retry` loads
 * it again from scratch (React.lazy would otherwise remember the failure).
 */
export function Lazy<P extends object>(props: {
  load: Loader<P>;
  props: P;
  loading: ReactNode;
  failed: (retry: () => void) => ReactNode;
}) {
  const { load } = props;
  const [attempt, setAttempt] = useState(0);
  const Loaded = useMemo(() => lazy(load), [load, attempt]);
  const retry = () => setAttempt((a) => a + 1);
  return (
    <Boundary resetKey={attempt} fallback={props.failed(retry)}>
      <Suspense fallback={props.loading}>
        <Loaded {...props.props} />
      </Suspense>
    </Boundary>
  );
}

/** The standard "didn't load" message with a retry, plus a reload when nothing would be lost. */
export function LoadFailed(props: { what: string; detail?: string; onRetry: () => void; onBack?: () => void }) {
  return (
    <section className="load-failed" role="alert">
      <p className="load-failed__title">{props.what} didn’t load.</p>
      <p>{props.detail ?? 'You may be offline, or the app was just updated.'}</p>
      <div className="load-failed__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={props.onRetry}>
          TRY AGAIN
        </button>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => reloadIfIdle()}>
          RELOAD APP
        </button>
        {props.onBack && (
          <button type="button" className="btn btn--secondary btn--small" onClick={props.onBack}>
            BACK TO MODES
          </button>
        )}
      </div>
    </section>
  );
}
