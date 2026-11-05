import { useState } from 'react';
import App from './App';
import { Lazy, LoadFailed } from './components/LoadBoundary';
import { ModePicker } from './components/ModePicker';
import type { AppMode } from './lib/prefs';

// The route library (and its map library) and the dashboard load only when
// opened, so the timer's first load stays as small as before.
const loadRoutes = () => import('./sixk/SixKMode');
const loadDashboard = () => import('./dashboard/DashboardMode');

/**
 * Always opens on the mode picker ("What are we doing today?").
 * The timer (`App`) is unchanged; it only gains "Switch mode" in Settings.
 */
export default function Root() {
  const [mode, setMode] = useState<AppMode | null>(null);
  const toPicker = () => setMode(null);

  if (mode === 'timer') return <App onSwitchMode={toPicker} />;
  if (mode === 'sixk' || mode === 'dashboard') {
    const routes = mode === 'sixk';
    return (
      <Lazy
        key={mode}
        load={routes ? loadRoutes : loadDashboard}
        props={{ onSwitchMode: toPicker }}
        loading={<p className="loading">{routes ? 'Loading routes…' : 'Loading the dashboard…'}</p>}
        failed={(retry) => (
          <div className="app">
            <LoadFailed what={routes ? 'The route library' : 'The dashboard'} onRetry={retry} onBack={toPicker} />
          </div>
        )}
      />
    );
  }
  return <ModePicker onPick={setMode} />;
}
