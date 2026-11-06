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

// Dev only: `?sim` swaps in a fake GPS that runs along a route (src/dev/simulateGps.ts).
// `import.meta.env.DEV` is false in production builds, so this branch and its chunk are dropped.
const params = new URLSearchParams(location.search);
if (import.meta.env.DEV && params.has('duck-sheet')) {
  // Dev only: `?duck-sheet` shows every outfit scenario on the dressed duck (src/dev/duckSheet/).
  import('./dev/duckSheet/DuckSheet')
    .then(({ default: DuckSheet }) =>
      createRoot(document.getElementById('root') as HTMLElement).render(
        <StrictMode>
          <DuckSheet />
        </StrictMode>,
      ),
    )
    .catch((err) => console.error('Duck sheet failed', err));
} else if (import.meta.env.DEV && params.has('meeting-map')) {
  // Dev only: `?meeting-map` draws and saves the story's meeting-point picture (src/dev/meetingMap/).
  import('./dev/meetingMap/MeetingMap')
    .then(({ default: MeetingMap }) =>
      createRoot(document.getElementById('root') as HTMLElement).render(
        <StrictMode>
          <MeetingMap />
        </StrictMode>,
      ),
    )
    .catch((err) => console.error('Meeting map failed', err));
} else if (import.meta.env.DEV && params.has('sim')) {
  import('./dev/simulateGps')
    .then((m) => m.installSimulatedGps(params))
    .catch((err) => console.error('GPS simulator failed', err))
    .finally(render);
} else {
  render();
}
