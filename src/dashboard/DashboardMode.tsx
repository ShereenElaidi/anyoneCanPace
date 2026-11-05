import { useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import duck from '../assets/duck-runner.webp';
import { hourAt, sunFor, weatherText } from '../weather/forecast';
import { whatToWear } from '../weather/outfit';
import { defaultRunTime, outfitInputFor, runTimeChoices } from '../weather/runTime';
import { clockTime, dayLabel, degrees, runTimeLabel } from './format';
import { useForecast } from './useForecast';
import './dashboard.css';

/** A saved forecast older than this gets an "may be out of date" warning. */
const OLD_FORECAST_MS = 6 * 3_600_000;

interface Props {
  onSwitchMode: () => void;
}

/** Daily Dashboard: today's weather at run time and what to wear. Loaded on demand. */
export default function DashboardMode({ onSwitchMode }: Props) {
  useRegisterSW();
  const { forecast, state, refresh } = useForecast();
  const [picked, setPicked] = useState<number | null>(null);
  // "Now" moves on while the page stays open, so the default hour stays sensible.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const choices = useMemo(() => (forecast ? runTimeChoices(forecast, now) : []), [forecast, now]);
  const fallback = forecast ? defaultRunTime(forecast, now) : null;
  const runAt = picked !== null && choices.includes(picked) ? picked : fallback;
  const input = forecast && runAt !== null ? outfitInputFor(forecast, runAt) : null;
  const outfit = input ? whatToWear(input) : null;
  const hour = forecast && runAt !== null ? hourAt(forecast, runAt) : null;
  const sun = forecast && runAt !== null ? sunFor(forecast, runAt) : null;


  return (
    <div className="app dash">
      <header className="header">
        <div>
          <p className="brand brand--small">AnyoneCanPace</p>
          <h1 className="dash__title">Daily Dashboard</h1>
        </div>
        <button type="button" className="btn btn--secondary btn--small" onClick={onSwitchMode}>
          MODES
        </button>
      </header>

      <main className="main">
        <StatusLine updatedAt={forecast?.fetchedAt ?? null} state={state} now={now} onRefresh={() => void refresh()} />

        {choices.length > 0 && runAt !== null && (
          <div className="run-time">
            <label htmlFor="run-time" className="run-time__label">
              Run starts
            </label>
            <select
              id="run-time"
              className="run-time__select"
              value={runAt}
              onChange={(e) => setPicked(Number(e.target.value))}
            >
              {choices.map((at) => (
                <option key={at} value={at}>
                  {runTimeLabel(at, now)}
                </option>
              ))}
            </select>
          </div>
        )}

        {!forecast && state !== 'loading' && (
          <section className="dash-card dash-card--empty" role="status">
            <p className="dash-card__big">Check outside</p>
            <p>No forecast yet{state === 'offline' ? ' and you’re offline' : ''}. Look at the sky and feel the air before you dress.</p>
          </section>
        )}
        {!forecast && state === 'loading' && <p className="loading">Getting today’s forecast…</p>}

        {forecast && !outfit && (
          <section className="dash-card dash-card--empty" role="status">
            <p className="dash-card__big">Check outside</p>
            <p>The saved forecast doesn’t cover the coming hours. Connect to the internet to update it.</p>
          </section>
        )}

        {outfit && hour && runAt !== null && (
          <>
            <section className="dash-card weather" aria-labelledby="weather-title">
              <h2 id="weather-title" className="dash__h2">
                Weather for {runTimeLabel(runAt, now).replace(/^(Today|Tomorrow)/, (d) => d.toLowerCase())}
              </h2>
              <p className="weather__feels">
                Feels like <strong>{degrees(hour.feelsC)}</strong>
              </p>
              <ul className="weather__facts">
                <li>
                  {weatherText(hour.code)}, air {degrees(hour.tempC)}
                </li>
                <li>
                  {hour.precipProb !== null ? `${Math.round(hour.precipProb)} % chance of rain or snow` : 'Chance of rain unknown'}
                  {hour.precipMm > 0 ? ` (${hour.precipMm.toFixed(1)} mm)` : ''}
                </li>
                <li>
                  Wind {Math.round(hour.windKmh)} km/h, gusts {Math.round(hour.gustKmh)} km/h
                </li>
                {sun && (
                  <li>
                    Sunrise {clockTime(sun.sunrise)} · sunset {clockTime(sun.sunset)}
                  </li>
                )}
              </ul>
            </section>

            <section className="dash-card wear" aria-labelledby="wear-title">
              <h2 id="wear-title" className="dash__h2">
                What to wear
              </h2>
              <div className="wear__body">
                {/* Stage 3 dresses this duck from outfit.items. It is decorative: the list below carries the meaning. */}
                <div className="duck-slot" aria-hidden="true" data-outfit={outfit.items.map((i) => i.id).join(' ')}>
                  <img src={duck} alt="" draggable={false} />
                </div>
                <div className="wear__text">
                  <p className="wear__headline">{outfit.headline}</p>
                  <p className="wear__runfeel">
                    Run feel {degrees(outfit.runFeelC)} (feels like + {Math.round(outfit.runFeelC - hour.feelsC)} °C, because
                    you warm up)
                  </p>
                </div>
              </div>
              <ul className="wear__items">
                {outfit.items.map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ul>
              <ul className="wear__notes">
                {outfit.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          </>
        )}

        <p className="credits">
          Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0), from Environment and Climate
          Change Canada’s GEM model, for central Montréal. Sun strength (UV) is estimated from the sun’s height and cloud
          cover.
        </p>
      </main>

      <footer className="footer">
        <p>ANYONE CAN RUN. ANYONE CAN PACE.</p>
      </footer>
    </div>
  );
}

function StatusLine(props: {
  updatedAt: number | null;
  state: ReturnType<typeof useForecast>['state'];
  now: number;
  onRefresh: () => void;
}) {
  const { updatedAt, state, now } = props;
  let text: string;
  if (state === 'loading') text = updatedAt ? `Updating… (last ${when(updatedAt, now)})` : 'Getting the forecast…';
  else if (!updatedAt) text = state === 'offline' ? 'Offline: no forecast saved yet.' : state === 'failed' ? 'Couldn’t get the forecast.' : '';
  else if (state === 'offline') text = sentence(`Offline: showing the forecast from ${when(updatedAt, now)}`);
  else if (state === 'failed') text = sentence(`Couldn’t update: showing the forecast from ${when(updatedAt, now)}`);
  else text = sentence(`Updated ${when(updatedAt, now)}`);
  const old = updatedAt !== null && now - updatedAt > OLD_FORECAST_MS;

  return (
    <div className={`dash-status${old || state === 'offline' || state === 'failed' ? ' dash-status--stale' : ''}`}>
      <p aria-live="polite">
        {text}
        {old && state !== 'loading' ? ' It may be out of date.' : ''}
      </p>
      <button
        type="button"
        className="btn btn--secondary btn--small"
        onClick={props.onRefresh}
        disabled={state === 'loading'}
      >
        REFRESH
      </button>
    </div>
  );
}

/** "7:42 a.m.", "yesterday 7:42 a.m." or "Monday 7:42 a.m." */
function when(at: number, now: number): string {
  const day = dayLabel(at, now);
  if (day === 'Today') return clockTime(at);
  return `${day === 'Yesterday' || day === 'Tomorrow' ? day.toLowerCase() : day} ${clockTime(at)}`;
}

/** Ends with exactly one full stop ("a.m." already has one). */
const sentence = (s: string) => (s.endsWith('.') ? s : `${s}.`);
