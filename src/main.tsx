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

// Dev only: `?duck-sheet`, `?meeting-map` and `?edit` (the route editor, src/dev/routeEditor/) open a
// dev page instead of the app, and `?sim` swaps in a fake GPS that runs along a route (src/dev/simulateGps.ts).
// `import.meta.env.DEV` is false in production builds, so these branches and their chunks are dropped.
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
} else if (import.meta.env.DEV && params.has('story-sheet')) {
  // Dev only: `?story-sheet` draws the Sunday story for example weathers (src/dev/storySheet/).
  import('./dev/storySheet/StorySheet')
    .then(({ default: StorySheet }) =>
      createRoot(document.getElementById('root') as HTMLElement).render(
        <StrictMode>
          <StorySheet />
        </StrictMode>,
      ),
    )
    .catch((err) => console.error('Story sheet failed', err));
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
} else if (import.meta.env.DEV && params.has('edit')) {
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
