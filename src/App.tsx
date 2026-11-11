import { useCallback, useEffect, useMemo, useState } from 'react';
import { setSessionBusy } from './lib/swUpdate';
import { UpdateBanner } from './components/UpdateBanner';
import { GearIcon } from './components/GearIcon';
import { EditPanel } from './components/EditPanel';
import { MenuSheet } from './components/MenuSheet';
import { TimerDisplay } from './components/TimerDisplay';
import { useIntervalTimer, type TimerEvent } from './hooks/useIntervalTimer';
import { useWakeLock } from './hooks/useWakeLock';
import { canVibrate, playCue, setLoudCues, unlockAudio, vibrateCue } from './lib/cues';
import { loadPrefs, savePrefs, type Prefs } from './lib/prefs';
import { clampSeconds, type Phase } from './timer/engine';

const STATUS_LABEL = { ready: 'READY', active: 'ACTIVE', paused: 'PAUSED' } as const;

interface AppProps {
  /** Shows HOME in the header. Omitted when the timer runs on its own. */
  onSwitchMode?: () => void;
}

export default function App({ onSwitchMode }: AppProps = {}) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [armedModes, setArmedModes] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const vibrationSupported = useMemo(canVibrate, []);

  useEffect(() => savePrefs(prefs), [prefs]);
  useEffect(() => setLoudCues(prefs.loud), [prefs.loud]);

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

  // The arm lapses, so a stray later tap never ends a session.
  useEffect(() => {
    if (!armedModes) return;
    const id = window.setTimeout(() => setArmedModes(false), 4000);
    return () => window.clearTimeout(id);
  }, [armedModes]);

  /** HOME in the header: one tap when ready, two mid-session (it ends the session). */
  const switchMode = () => {
    if (status !== 'ready' && !armedModes) {
      setArmedModes(true);
      return;
    }
    setArmedModes(false);
    onSwitchMode?.();
  };

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
    <div className={`app app--paper${editing ? ' app--editing' : ''}`}>
      <header className="header">
        <div>
          <p className="brand brand--small">AnyoneCanPace</p>
          <h1 className="timer__title">ACR Timer</h1>
          <span className={`status status--${status}`}>{STATUS_LABEL[status]}</span>
        </div>
        <div className="header__side">
          <button
            type="button"
            className="btn btn--secondary btn--icon"
            aria-label="Settings"
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            <GearIcon />
          </button>
          {onSwitchMode && (
            <button
              type="button"
              className={`btn btn--secondary btn--small${armedModes ? ' is-confirming' : ''}`}
              onClick={switchMode}
            >
              {armedModes ? 'END? TAP AGAIN' : 'HOME'}
            </button>
          )}
        </div>
      </header>

      <main className="main">
        <UpdateBanner />
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
        loud={prefs.loud}
        vibrationSupported={vibrationSupported}
        wakeLock={wakeLock}
        onToggleSound={() => {
          unlockAudio();
          setPrefs((p) => ({ ...p, sound: !p.sound }));
        }}
        onToggleVibration={() => setPrefs((p) => ({ ...p, vibration: !p.vibration }))}
        onToggleLoud={() => {
          unlockAudio();
          setPrefs((p) => ({ ...p, loud: !p.loud }));
        }}
        onReset={timer.reset}
      />
    </div>
  );
}
