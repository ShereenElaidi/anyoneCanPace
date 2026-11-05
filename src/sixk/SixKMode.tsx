import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { SW_OPTIONS } from '../lib/swUpdate';
import { loadRoute, manifest, type LoadedRoute } from './data';
import { FollowView } from './FollowView';
import { Library } from './Library';
import { RoutePage } from './RoutePage';
import './sixk.css';

type View = { name: 'library' } | { name: 'route'; id: string } | { name: 'follow'; id: string };

interface Props {
  onSwitchMode: () => void;
}

/**
 * 6K Route Library mode: library → route page → follow view.
 * Loaded on demand (code-split), together with its styles.
 *
 * Screens are mirrored in the browser history, so the phone's back gesture
 * goes back a screen instead of leaving the app. Mid-route, back opens the
 * route menu instead (ending a route always needs the menu).
 */
export default function SixKMode({ onSwitchMode }: Props) {
  const [view, setView] = useState<View>({ name: 'library' });
  const [route, setRoute] = useState<LoadedRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuRequest, setMenuRequest] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const {
    needRefresh: [updateReady],
    updateServiceWorker,
  } = useRegisterSW(SW_OPTIONS);

  const id = view.name === 'library' ? null : view.id;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    loadRoute(id).then(
      (r) => !cancelled && setRoute(r),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the route'),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  const go = useCallback((next: View) => {
    try {
      history.pushState({ sixk: next }, '');
    } catch {
      // History unavailable (some embedded browsers): in-app buttons still work.
    }
    setView(next);
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const current = viewRef.current;
      if (current.name === 'follow') {
        // Don't leave a route by accident: stay, and open the menu.
        history.pushState({ sixk: current }, '');
        setMenuRequest((n) => n + 1);
        return;
      }
      const target = (e.state as { sixk?: View } | null)?.sixk;
      setView(target ?? { name: 'library' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const loaded = route && id && route.data.id === id ? route : null;
  const title = view.name === 'library' ? '6K Route Library' : (manifest.routes.find((r) => r.id === id)?.name ?? 'Route');

  if (view.name === 'follow') {
    if (!loaded) return <p className="loading">{error ?? 'Loading route…'}</p>;
    return <FollowView key={loaded.data.id} route={loaded} menuRequest={menuRequest} onExit={() => go({ name: 'route', id: loaded.data.id })} />;
  }

  return (
    <div className="app sixk">
      <header className="header">
        <div>
          <p className="brand brand--small">AnyoneCanPace</p>
          <h1 className="sixk__title">{title}</h1>
        </div>
        {view.name === 'library' ? (
          <button type="button" className="btn btn--secondary btn--small" onClick={onSwitchMode}>
            MODES
          </button>
        ) : (
          <button type="button" className="btn btn--secondary btn--small" onClick={() => go({ name: 'library' })}>
            ‹ ROUTES
          </button>
        )}
      </header>

      <main className="main">
        {updateReady && (
          <button type="button" className="btn btn--secondary btn--block" onClick={() => void updateServiceWorker(true)}>
            UPDATE TO NEW VERSION
          </button>
        )}
        {view.name === 'library' && <Library onOpen={(routeId) => go({ name: 'route', id: routeId })} />}
        {view.name === 'route' &&
          (loaded ? (
            <RoutePage route={loaded} onStart={() => go({ name: 'follow', id: loaded.data.id })} />
          ) : (
            <p className="loading">{error ?? 'Loading route…'}</p>
          ))}
      </main>

      <footer className="footer">
        <p>ANYONE CAN RUN. ANYONE CAN PACE.</p>
      </footer>
    </div>
  );
}
