import { useRegisterSW } from 'virtual:pwa-register/react';
import duck from '../assets/duck-runner.webp';
import type { AppMode } from '../lib/prefs';

interface Props {
  onPick: (mode: AppMode) => void;
}

/** Home screen: choose what to open. The last choice is remembered. */
export function ModePicker({ onPick }: Props) {
  // Registers the service worker (offline support) when the app opens here.
  useRegisterSW();

  return (
    <div className="app picker">
      <header className="picker__head">
        <img className="picker__duck" src={duck} alt="" width={72} height={72} />
        <div>
          <h1 className="brand">
            AnyoneCanPace{__BETA__ && <span className="beta-tag">BETA</span>}
          </h1>
          <p className="tagline">RUN TOGETHER. WALK TOGETHER.</p>
        </div>
      </header>

      <main className="main">
        <h2 className="picker__title">What are we doing today?</h2>
        <ul className="picker__list">
          <li>
            <button type="button" className="mode-card mode-card--timer" onClick={() => onPick('timer')}>
              <span className="mode-card__name">ACR Run/Walk Timer</span>
              <span className="mode-card__help">RUN and WALK intervals for pacing the group.</span>
            </button>
          </li>
          <li>
            <button type="button" className="mode-card mode-card--sixk" onClick={() => onPick('sixk')}>
              <span className="mode-card__name">6K Route Library</span>
              <span className="mode-card__help">Pick a route and follow it on a street map.</span>
            </button>
          </li>
          <li>
            <button type="button" className="mode-card mode-card--dashboard" onClick={() => onPick('dashboard')}>
              <span className="mode-card__name">Daily Dashboard</span>
              <span className="mode-card__help">Today’s weather at run time and what to wear.</span>
            </button>
          </li>
        </ul>
        <p className="picker__note">You can switch modes later from each mode’s menu.</p>
      </main>

      <footer className="footer">
        <p>ANYONE CAN RUN. ANYONE CAN PACE.</p>
      </footer>
    </div>
  );
}
