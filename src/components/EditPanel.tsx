import { useEffect, useRef } from 'react';
import { MAX_SECONDS, MIN_SECONDS, STEP_SECONDS, type Durations, type Phase, type Status } from '../timer/engine';
import { formatClock, spokenDuration } from '../timer/format';

interface Props {
  id: string;
  durations: Durations;
  status: Status;
  onChange: (phase: Phase, seconds: number) => void;
  onDone: () => void;
}

export function EditPanel({ id, durations, status, onChange, onDone }: Props) {
  const ref = useRef<HTMLElement>(null);

  // Bring the steppers on screen without scrolling the countdown further than needed.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  return (
    <section ref={ref} id={id} className="edit" aria-label="Edit intervals">
      <Stepper phase="run" seconds={durations.run} onChange={onChange} />
      <Stepper phase="walk" seconds={durations.walk} onChange={onChange} />
      <p className="edit__hint">
        {status === 'ready'
          ? 'Between 15 seconds and 30 minutes.'
          : 'Changes start with the next RUN or WALK. The current interval keeps going.'}
      </p>
      <button type="button" className="btn btn--secondary btn--block" onClick={onDone}>
        DONE
      </button>
    </section>
  );
}

function Stepper({
  phase,
  seconds,
  onChange,
}: {
  phase: Phase;
  seconds: number;
  onChange: (phase: Phase, seconds: number) => void;
}) {
  const label = phase.toUpperCase();
  const word = phase === 'run' ? 'Run' : 'Walk';
  return (
    <div className={`stepper stepper--${phase}`} role="group" aria-label={`${word} duration`}>
      <button
        type="button"
        className="btn btn--step"
        aria-label={`${word} 15 seconds shorter`}
        disabled={seconds <= MIN_SECONDS}
        onClick={() => onChange(phase, seconds - STEP_SECONDS)}
      >
        −15s
      </button>
      <p className="stepper__value">
        <span className="stepper__label">{label}</span>
        <output aria-live="polite" aria-label={`${word} ${spokenDuration(seconds)}`}>
          {formatClock(seconds)}
        </output>
      </p>
      <button
        type="button"
        className="btn btn--step"
        aria-label={`${word} 15 seconds longer`}
        disabled={seconds >= MAX_SECONDS}
        onClick={() => onChange(phase, seconds + STEP_SECONDS)}
      >
        +15s
      </button>
    </div>
  );
}
