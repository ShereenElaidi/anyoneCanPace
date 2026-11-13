import { useState, useSyncExternalStore } from 'react';
import { installHintKind, installPlatform } from '../lib/installHint';
import {
  canPromptInstall,
  dismissInstallHint,
  installedThisVisit,
  installHintDismissed,
  promptInstall,
  runningInstalled,
  subscribeInstallPrompt,
} from '../lib/installPrompt';

/** The iOS Share icon (a box with an arrow up), so people know what to look for. */
function ShareIcon() {
  return (
    <svg className="install-hint__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * "Add it to your home screen" on the home screen, for phones only. Phones don't
 * say it themselves (iOS never does; Android rarely). Gone once installed or
 * after NOT NOW, which is remembered on this phone.
 */
export function InstallHint() {
  const canPrompt = useSyncExternalStore(subscribeInstallPrompt, canPromptInstall, () => false);
  const justInstalled = useSyncExternalStore(subscribeInstallPrompt, installedThisVisit, () => false);
  const [dismissed, setDismissed] = useState(installHintDismissed);
  const [installed] = useState(runningInstalled);

  const kind = installHintKind({
    platform: installPlatform({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 }),
    installed: installed || justInstalled,
    dismissed,
    canPrompt,
  });
  if (kind === 'none') return null;

  const notNow = () => {
    dismissInstallHint();
    setDismissed(true);
  };

  return (
    <section className="install-hint" aria-labelledby="install-hint-title">
      <h2 id="install-hint-title" className="install-hint__title">
        Add it to your home screen
      </h2>
      <p>It opens like an app, full screen, and works offline on the run.</p>
      {kind === 'ios-share' && (
        <p className="install-hint__how">
          Tap <strong>Share</strong> <ShareIcon />, then <strong>Add to Home Screen</strong>.
        </p>
      )}
      {kind === 'browser-menu' && (
        <p className="install-hint__how">
          Open your browser’s menu <strong aria-label="(three dots)">⋮</strong>, then <strong>Install app</strong> or{' '}
          <strong>Add to Home screen</strong>.
        </p>
      )}
      <div className="install-hint__actions">
        {kind === 'prompt' && (
          <button type="button" className="btn btn--small install-hint__install" onClick={() => void promptInstall()}>
            INSTALL
          </button>
        )}
        <button type="button" className="btn btn--small btn--secondary" onClick={notNow}>
          {kind === 'prompt' ? 'NOT NOW' : 'GOT IT'}
        </button>
      </div>
    </section>
  );
}
