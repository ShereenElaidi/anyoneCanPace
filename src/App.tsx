import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { setSessionBusy, SW_OPTIONS } from './lib/swUpdate';
import { EditPanel } from './components/EditPanel';
import { MenuSheet } from './components/MenuSheet';
import { TimerDisplay } from './components/TimerDisplay';
import { useIntervalTimer, type TimerEvent } from './hooks/useIntervalTimer';
import { useWakeLock } from './hooks/useWakeLock';
import { canVibrate, playCue, unlockAudio, vibrateCue } from './lib/cues';
import { loadPrefs, savePrefs, type Prefs } from './lib/prefs';
import { clampSeconds, type Phase } from './timer/engine';

const STATUS_LABEL = { ready: 'READY', active: 'ACTIVE', paused: 'PAUSED' } as const;

interface AppProps {
  /** Shows "Switch mode" in Settings. Omitted when the timer runs on its own. */
  onSwitchMode?: () => void;
}

export default function App({ onSwitchMode }: AppProps = {}) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const vibrationSupported = useMemo(canVibrate, []);

  useEffect(() => savePrefs(prefs), [prefs]);

  const durations = useMemo(() => ({ run: prefs.run, walk: prefs.walk }), [prefs.run, prefs.walk]);

  // Repeating the same text must still be announced, so alternate a trailing space.
  const announce = useCallback((text: string) => {
    setAnnouncement((prev) => (prev === text ? `${text} ` : text));
  }, []);

  const onEvent = (event: TimerEvent) => {
    switch (event.kind) {
      case 'phase': {
        const word = event.phase.toUpperCase();
        announce(event.skipped ? `Skipped. ${word} now.` : `${word} now.`);
        if (event.fresh) {
          if (prefs.sound) playCue(event.phase);
          if (prefs.vibration) vibrateCue(event.phase);
        }
        break;
      }
      case 'started':
        announce('Session started. RUN.');
        break;
      case 'paused':
        announce('Paused.');
        break;
      case 'resumed':
        announce('Resumed.');
        break;
      case 'reset':
        announce('Session reset. Ready to RUN.');
        break;
    }
  };

  const timer = useIntervalTimer(durations, onEvent);
  const { status } = timer.state;
  const wakeLock = useWakeLock(status === 'active');
  // A running or paused session must never be lost to an update reload.
  useEffect(() => {
    setSessionBusy('timer', status !== 'ready');
    return () => setSessionBusy('timer', false);
  }, [status]);

  const {
    needRefresh: [updateReady],
    updateServiceWorker,
  } = useRegisterSW(SW_OPTIONS);

  const setDuration = (phase: Phase, seconds: number) =>
    setPrefs((p) => ({ ...p, [phase]: clampSeconds(seconds) }));

  const primary = () => {
    if (status === 'active') {
      timer.pause();
      return;
    }
    // Tapping is the user gesture browsers require before audio can play.
    unlockAudio();
    if (status === 'ready') timer.start();
    else timer.resume();
  };

  const primaryLabel = status === 'ready' ? 'START PACING' : status === 'active' ? 'PAUSE' : 'RESUME';
  const screenMaySleep = status === 'active' && (wakeLock === 'failed' || wakeLock === 'unsupported');

  return (
    <div className={`app${editing ? ' app--editing' : ''}`}>
      <header className="header">
        <div>
          <h1 className="brand">AnyoneCanPace</h1>
          <p className="tagline">RUN TOGETHER. WALK TOGETHER.</p>
        </div>
        <div className="header__side">
          <span className={`status status--${status}`}>{STATUS_LABEL[status]}</span>
          <button
            type="button"
            className="btn btn--icon"
            aria-label="Settings"
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="5" cy="12" r="2.2" />
              <circle cx="12" cy="12" r="2.2" />
              <circle cx="19" cy="12" r="2.2" />
            </svg>
          </button>
        </div>
      </header>

      <main className="main">
        <TimerDisplay state={timer.state} remainingMs={timer.remainingMs} />

        <div className="controls">
          <button type="button" className="btn btn--primary btn--block" onClick={primary}>
            {primaryLabel}
          </button>
          <div className="controls__row">
            <button
              type="button"
              className="btn btn--secondary"
              aria-expanded={editing}
              aria-controls="edit-panel"
              onClick={() => setEditing((e) => !e)}
            >
              EDIT INTERVALS
            </button>
            {status !== 'ready' && (
              <button type="button" className="btn btn--secondary" onClick={timer.skip}>
                SKIP <span aria-hidden="true">»</span>
                <span className="visually-hidden"> to {timer.state.phase === 'run' ? 'WALK' : 'RUN'}</span>
              </button>
            )}
          </div>
        </div>

        {editing && (
          <EditPanel
            id="edit-panel"
            durations={durations}
            status={status}
            onChange={setDuration}
            onDone={() => setEditing(false)}
          />
        )}

        {screenMaySleep && (
          <p className="notice">Screen may lock. Set auto-lock to “Never” while pacing.</p>
        )}
      </main>

      <footer 
      className="footer">
      <p>ANYONE CAN RUN. ANYONE CAN PACE.</p>
      <p className="footer_extra">Brought to you by VibeCoding, Monsieur Claude, and Sparkling Water.
        </p>
      </footer>

      <p className="visually-hidden" aria-live="assertive" aria-atomic="true">
        {announcement}
      </p>

      <MenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        status={status}
        sound={prefs.sound}
        vibration={prefs.vibration}
        vibrationSupported={vibrationSupported}
        wakeLock={wakeLock}
        updateReady={updateReady}
        onToggleSound={() => {
          unlockAudio();
          setPrefs((p) => ({ ...p, sound: !p.sound }));
        }}
        onToggleVibration={() => setPrefs((p) => ({ ...p, vibration: !p.vibration }))}
        onReset={timer.reset}
        onUpdate={() => void updateServiceWorker(true)}
        onSwitchMode={onSwitchMode}
      />
    </div>
  );
}
