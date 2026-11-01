import duck from '../assets/duck-runner.webp';
import { displaySeconds, formatClock, spokenDuration } from '../timer/format';
import { otherPhase, type TimerState } from '../timer/engine';

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  state: TimerState;
  remainingMs: number;
}

export function TimerDisplay({ state, remainingMs }: Props) {
  const { phase, intervalMs } = state;
  const seconds = displaySeconds(remainingMs);
  const fraction = intervalMs > 0 ? Math.min(1, Math.max(0, remainingMs / intervalMs)) : 0;
  const label = phase.toUpperCase();
  // The arc's leading edge sits `fraction` of a turn clockwise from 12 o'clock and retreats
  // counter-clockwise as time runs out, so the duck faces left on the top half and right below.
  const angle = fraction * 360;
  const facingLeft = fraction < 0.25 || fraction > 0.75;

  return (
    <section className={`panel panel--${phase}`} aria-label="Current interval">
      <div className="ring-wrap">
        <svg className="ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="ring__track" cx="50" cy="50" r={RADIUS} />
          <circle
            // A new key on phase change skips the "unwind" animation from empty to full.
            key={phase}
            className="ring__progress"
            cx="50"
            cy="50"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        </svg>
        <div
          // Remounted per phase, like the arc, so the duck doesn't sweep back around on a phase change.
          key={`duck-${phase}`}
          className="duck-orbit"
          aria-hidden="true"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <img
            className="duck-orbit__duck"
            src={duck}
            alt=""
            draggable={false}
            style={{ transform: `translate(-50%, -50%) rotate(${-angle}deg) scaleX(${facingLeft ? -1 : 1})` }}
          />
        </div>
        <div className="readout">
          <p className="phase-label">{label}</p>
          <p className="countdown" role="timer" aria-label={`${label}, ${spokenDuration(seconds)} left`}>
            {formatClock(seconds)}
          </p>
        </div>
      </div>
      <p className="next">
        NEXT: <strong>{otherPhase(phase).toUpperCase()}</strong>
      </p>
    </section>
  );
}
