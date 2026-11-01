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
