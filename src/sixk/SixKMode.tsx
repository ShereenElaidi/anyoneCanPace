import { UpdateBanner } from '../components/UpdateBanner';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRoutePace, saveRoutePace } from '../lib/prefs';
import { loadRoute, manifest, type LoadedRoute } from './data';
import { clampPace, PACE, type RouteFilter } from './describe';
import { FollowView } from './FollowView';
import { Library } from './Library';
import { LibrarySettings } from './LibrarySettings';
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
  // Library settings. The pace is saved; the filter lasts for this visit only.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pace, setPace] = useState(() => loadRoutePace(clampPace) ?? PACE.default);
  const [filter, setFilter] = useState<RouteFilter>('all');
  const changePace = useCallback((p: number) => {
    setPace(p);
    saveRoutePace(p);
  }, []);
  useEffect(() => {
    if (view.name !== 'library') setSettingsOpen(false);
  }, [view.name]);
  const viewRef = useRef(view);
  viewRef.current = view;

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
  const title = view.name === 'library' ? 'Route Library' : (manifest.routes.find((r) => r.id === id)?.name ?? 'Route');

  if (view.name === 'follow') {
    if (!loaded) return <p className="loading">{error ?? 'Loading route…'}</p>;
    return <FollowView key={loaded.data.id} route={loaded} menuRequest={menuRequest} onExit={() => go({ name: 'route', id: loaded.data.id })} />;
  }

  return (
    <div className="app app--paper sixk">
      <header className="header">
        <div>
          <p className="brand brand--small">AnyoneCanPace</p>
          <h1 className="sixk__title">{title}</h1>
        </div>
        {view.name === 'library' ? (
          <div className="header__side">
            <button type="button" className="btn btn--secondary btn--icon lib-gear" aria-label="Library settings" onClick={() => setSettingsOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
              </svg>
            </button>
            <button type="button" className="btn btn--secondary btn--small" onClick={onSwitchMode}>
              MODES
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--secondary btn--small" onClick={() => go({ name: 'library' })}>
            ‹ ROUTES
          </button>
        )}
      </header>

      <main className="main">
        <UpdateBanner />
        {view.name === 'library' && (
          <>
            <Library onOpen={(routeId) => go({ name: 'route', id: routeId })} pace={pace} filter={filter} onFilter={setFilter} />
            <LibrarySettings
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              routes={manifest.routes}
              pace={pace}
              onPace={changePace}
              filter={filter}
              onFilter={setFilter}
            />
          </>
        )}
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
