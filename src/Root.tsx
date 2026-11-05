import { lazy, Suspense, useState } from 'react';
import App from './App';
import { ModePicker } from './components/ModePicker';
import { loadMode, saveMode, type AppMode } from './lib/prefs';

// The 6K mode (and its map library) loads only when it is opened, so the
// timer's first load stays as small as before.
const SixKMode = lazy(() => import('./sixk/SixKMode'));
const DashboardMode = lazy(() => import('./dashboard/DashboardMode'));

/**
 * Opens straight into the last-used mode, or shows the mode picker.
 * The timer (`App`) is unchanged; it only gains "Switch mode" in Settings.
 */
export default function Root() {
  const [mode, setMode] = useState<AppMode | null>(loadMode);

  const pick = (next: AppMode) => {
    saveMode(next);
    setMode(next);
  };
  const toPicker = () => setMode(null);

  if (mode === 'timer') return <App onSwitchMode={toPicker} />;
  if (mode === 'sixk') {
    return (
      <Suspense fallback={<p className="loading">Loading routes…</p>}>
        <SixKMode onSwitchMode={toPicker} />
      </Suspense>
    );
  }
  if (mode === 'dashboard') {
    return (
      <Suspense fallback={<p className="loading">Loading the dashboard…</p>}>
        <DashboardMode onSwitchMode={toPicker} />
      </Suspense>
    );
  }
  return <ModePicker onPick={pick} />;
}
