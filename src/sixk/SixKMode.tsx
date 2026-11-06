import { UpdateBanner } from '../components/UpdateBanner';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRoutePace, saveRoutePace } from '../lib/prefs';
import { matchSharedRoute, withoutRouteParam } from '../lib/routeLink';
import { loadRoute, manifest, type LoadedRoute } from './data';
import { availableFilters, clampPace, PACE, visibleRoutes, type RouteFilter } from './describe';
import { FollowView } from './FollowView';
import { Library } from './Library';
import { GearIcon } from '../components/GearIcon';
import { LibrarySettings } from './LibrarySettings';
import { RoutePage } from './RoutePage';
import './sixk.css';

type View = { name: 'library' } | { name: 'route'; id: string } | { name: 'follow'; id: string };

interface Props {
  onSwitchMode: () => void;
  /** From a shared route link (`?route=<id>`): open on this route's page. */
  openRoute?: string | null;
}

const routeIds = manifest.routes.map((r) => r.id);

/**
 * 6K Route Library mode: library → route page → follow view.
 * Loaded on demand (code-split), together with its styles.
 *
 * Screens are mirrored in the browser history, so the phone's back gesture
 * goes back a screen instead of leaving the app. Mid-route, back opens the
 * route menu instead (ending a route always needs the menu).
 */
export default function SixKMode({ onSwitchMode, openRoute }: Props) {
  // The route a shared link means (it may carry the share text glued on: see matchSharedRoute).
  const [linkedRoute] = useState(() => (openRoute ? matchSharedRoute(openRoute, routeIds) : null));
  const [view, setView] = useState<View>(() => (linkedRoute ? { name: 'route', id: linkedRoute } : { name: 'library' }));
  // A link to a route this version doesn't have (renamed, removed, or the app is older than the link).
  const [missingRoute, setMissingRoute] = useState(() => !!openRoute && !linkedRoute);
  const [route, setRoute] = useState<LoadedRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuRequest, setMenuRequest] = useState(0);
  // Library settings. The pace is saved; the filter lasts for this visit only.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pace, setPace] = useState(() => loadRoutePace(clampPace) ?? PACE.default);
  const [filter, setFilter] = useState<RouteFilter>('all');
  // Routes tagged "Testing" stay hidden unless turned on, also for this visit only.
  const [showTesting, setShowTesting] = useState(false);
  const changeShowTesting = useCallback((show: boolean) => {
    setShowTesting(show);
    // Hiding them can leave a filter that only matched testing routes ("10 km+"): back to All.
    if (!show) setFilter((f) => (availableFilters(visibleRoutes(manifest.routes, false)).some((a) => a.id === f) ? f : 'all'));
  }, []);
  const changePace = useCallback((p: number) => {
    setPace(p);
    saveRoutePace(p);
  }, []);
  useEffect(() => {
    if (view.name !== 'library') setSettingsOpen(false);
  }, [view.name]);
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    if (view.name !== 'library') setMissingRoute(false);
  }, [view.name]);

  // Opened from a shared link: drop `?route=` from the address (so a reload doesn't reopen it)
  // and put the library under the route page, so back goes to the library. Once, even in StrictMode.
  const linkHandled = useRef(false);
  useEffect(() => {
    if (!openRoute || linkHandled.current) return;
    linkHandled.current = true;
    try {
      history.replaceState({ sixk: { name: 'library' } satisfies View }, '', withoutRouteParam(location.href));
      if (linkedRoute) history.pushState({ sixk: { name: 'route', id: linkedRoute } satisfies View }, '');
    } catch {
      // History unavailable (some embedded browsers): in-app buttons still work.
    }
  }, [openRoute, linkedRoute]);

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
              <GearIcon />
            </button>
            <button type="button" className="btn btn--secondary btn--small" onClick={onSwitchMode}>
              HOME
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
            {missingRoute && (
              <p className="lib-missing" role="status">
                The shared route isn’t in this version of the app. It may have been renamed or removed: pick one below.
              </p>
            )}
            <Library
              onOpen={(routeId) => go({ name: 'route', id: routeId })}
              pace={pace}
              filter={filter}
              onFilter={setFilter}
              showTesting={showTesting}
              onShowTesting={changeShowTesting}
            />
            <LibrarySettings
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              routes={manifest.routes}
              pace={pace}
              onPace={changePace}
              filter={filter}
              onFilter={setFilter}
              showTesting={showTesting}
              onShowTesting={changeShowTesting}
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
