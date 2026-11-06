import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root';
import './styles.css';

function render() {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

// Dev only: `?edit` opens the route editor (src/dev/routeEditor/) instead of the app, and
// `?sim` swaps in a fake GPS that runs along a route (src/dev/simulateGps.ts).
// `import.meta.env.DEV` is false in production builds, so these branches and their chunks are dropped.
const params = new URLSearchParams(location.search);
if (import.meta.env.DEV && params.has('edit')) {
  import('./dev/routeEditor/RouteEditor')
    .then(({ default: RouteEditor }) =>
      createRoot(document.getElementById('root') as HTMLElement).render(
        <StrictMode>
          <RouteEditor />
        </StrictMode>,
      ),
    )
    .catch((err) => console.error('Route editor failed to load', err));
} else if (import.meta.env.DEV && params.has('sim')) {
  import('./dev/simulateGps')
    .then((m) => m.installSimulatedGps(params))
    .catch((err) => console.error('GPS simulator failed', err))
    .finally(render);
} else {
  render();
}
