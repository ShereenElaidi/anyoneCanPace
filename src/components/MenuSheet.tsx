import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Status } from '../timer/engine';
import type { WakeLockStatus } from '../hooks/useWakeLock';

interface Props {
  open: boolean;
  onClose: () => void;
  status: Status;
  sound: boolean;
  vibration: boolean;
  vibrationSupported: boolean;
  wakeLock: WakeLockStatus;
  updateReady: boolean;
  onToggleSound: () => void;
  onToggleVibration: () => void;
  onReset: () => void;
  onUpdate: () => void;
}

const WAKE_TEXT: Record<WakeLockStatus, string> = {
  on: 'Keeping the screen awake while pacing.',
  off: 'The screen is kept awake while a session is running.',
  failed: 'This browser refused to keep the screen awake. Set your phone’s auto-lock to “Never” while pacing.',
  unsupported: 'This browser can’t keep the screen awake. Set your phone’s auto-lock to “Never” while pacing.',
};

export function MenuSheet(props: Props) {
  const { open, onClose, status } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    if (!open) setConfirming(false);
  }, [open]);

  // The reset confirmation expires so a later stray tap can't trigger it.
  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  const handleReset = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    props.onReset();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby="menu-title"
      onClose={onClose}
      onClick={(e) => {
        // Tapping the backdrop closes the sheet.
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet__body">
        <div className="sheet__head">
          <h2 id="menu-title">Settings</h2>
          <button type="button" className="btn btn--secondary btn--small" onClick={onClose}>
            CLOSE
          </button>
        </div>

        <Toggle label="Sound cues" on={props.sound} onToggle={props.onToggleSound}>
          Two beeps for RUN, one long beep for WALK.
        </Toggle>
        <Toggle
          label="Vibration"
          on={props.vibration && props.vibrationSupported}
          disabled={!props.vibrationSupported}
          onToggle={props.onToggleVibration}
        >
          {props.vibrationSupported ? 'Buzz on every change.' : 'Not supported by this browser (including iPhone Safari).'}
        </Toggle>

        <p className="sheet__note">{WAKE_TEXT[props.wakeLock]}</p>

        {status !== 'ready' && (
          <button
            type="button"
            className={`btn btn--danger btn--block${confirming ? ' is-confirming' : ''}`}
            onClick={handleReset}
          >
            {confirming ? 'TAP AGAIN TO END SESSION' : 'END & RESET SESSION'}
          </button>
        )}

        {props.updateReady && status !== 'active' && (
          <button type="button" className="btn btn--secondary btn--block" onClick={props.onUpdate}>
            UPDATE TO NEW VERSION
          </button>
        )}

        <details className="sheet__about">
          <summary>Good to know</summary>
          <ul>
            <li>Keep this page open and the screen on. Phones pause web pages when locked or in the background, so cues can’t play then.</li>
            <li>When you come back, the timer jumps to the right interval. Missed beeps are not replayed.</li>
            <li>iPhone: the ring/silent switch can mute sound cues.</li>
            <li>Your interval settings stay on this device only. Nothing is tracked.</li>
          </ul>
        </details>
      </div>
    </dialog>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onToggle,
  children,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="toggle">
      <div>
        <p className="toggle__label">{label}</p>
        <p className="toggle__help">{children}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className="switch"
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="switch__text">{on ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
}
