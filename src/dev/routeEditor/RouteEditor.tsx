/**
 * Dev-only route editor, at `?edit` on `npm run dev` (src/main.tsx loads it
 * only when import.meta.env.DEV, so it never ships). It reads and writes the
 * repository's route files through the dev-server API (server/), which only
 * answers this computer. You review and commit the changed files as usual.
 *
 * Screens, by URL hash: "" the route list and tags, "#add" add a route,
 * "#route=<id>" a route's details.
 */
import { useEffect, useState } from 'react';
import '../../sixk/sixk.css';
import './editor.css';
import { AddRouteView } from './AddRouteView';
import { RouteDetailsView } from './RouteDetailsView';
import { RouteListView } from './RouteListView';
import { mayLeave } from './shared';

function screen(hash: string) {
  const h = hash.replace(/^#/, '');
  if (h === 'add') return { kind: 'add' as const };
  const m = h.match(/^route=([a-z0-9-]+)$/);
  if (m) return { kind: 'route' as const, id: m[1] };
  return { kind: 'list' as const };
}

export default function RouteEditor() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    document.title = 'Route editor · AnyoneCanPace (dev)';
    const onHash = (e: HashChangeEvent) => {
      if (!mayLeave()) {
        // Stay: put the old address back without another hashchange.
        const oldHash = e.oldURL ? new URL(e.oldURL).hash : '';
        history.replaceState(null, '', oldHash || location.pathname + location.search);
        return;
      }
      setHash(location.hash);
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const s = screen(hash);

  return (
    <main className="re">
      <header className="re-header">
        <p className="re-kicker">AnyoneCanPace · dev only</p>
        <h1>Route editor</h1>
        <p className="re-hint">
          Writes the files in <code>routes/</code> and <code>src/data/</code>. Review the changes with <code>git diff</code> and
          commit them as usual; nothing is pushed or published from here.
        </p>
      </header>
      {s.kind === 'list' && <RouteListView />}
      {s.kind === 'add' && <AddRouteView />}
      {s.kind === 'route' && <RouteDetailsView key={s.id} id={s.id} />}
    </main>
  );
}
