import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { SW_OPTIONS } from '../lib/swUpdate';
import { hourAt, sunFor, weatherText } from '../weather/forecast';
import { whatToWear } from '../weather/outfit';
import {
  defaultRunTime,
  EARLIEST_RUN_HOUR,
  LATEST_RUN_HOUR,
  localDate,
  localHour,
  outfitInputFor,
  runTimeChoices,
} from '../weather/runTime';
import { clockTime, dayLabel, degrees, hourLabel, runTimeLabel } from './format';
import advisoriesFile from '../data/advisories.json';
import manifestFile from '../data/routes/manifest.json';
import { lastCheckedText, NoticeList } from '../advisories/NoticeList';
import { activeNotices, collectNotices, type NoticeFile } from '../advisories/notices';
import { ROUTE_NOTICES } from '../advisories/routeAdvisories';
import type { RouteManifest } from '../nav/types';
import { DressedDuck } from './duck/DressedDuck';
import { duckWeather } from './duck/pieces';
import { useForecast } from './useForecast';
import './dashboard.css';

const advisories = advisoriesFile as NoticeFile;
const routeNames = Object.fromEntries((manifestFile as unknown as RouteManifest).routes.map((r) => [r.id, r.name]));

/** A saved forecast older than this gets an "may be out of date" warning. */
const OLD_FORECAST_MS = 6 * 3_600_000;

/** How many days of run times the hour strip offers. */
const PICKER_DAYS = 3;

interface Props {
  onSwitchMode: () => void;
}

/**
 * Daily Dashboard: what to wear for the run, with the dressed duck up front.
 * Weather numbers and tips sit behind "Weather details and tips". Loaded on demand.
 */
export default function DashboardMode({ onSwitchMode }: Props) {
  useRegisterSW(SW_OPTIONS);
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

  // Central advisories and each route's own, merged the same way the route pages do.
  const notices = activeNotices(collectNotices(advisories.notices, ROUTE_NOTICES), null, localDate(now));
  const updatedAt = forecast?.fetchedAt ?? null;
  // Problems with the forecast go to the top; a fresh "Updated" line sits quietly at the bottom.
  const statusNeedsAttention =
    !updatedAt || state === 'offline' || state === 'failed' || now - updatedAt > OLD_FORECAST_MS;
  const status = <StatusLine updatedAt={updatedAt} state={state} now={now} onRefresh={() => void refresh()} />;

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
        {statusNeedsAttention && status}

        {notices.length > 0 && (
          <section className="dash-advisories" aria-labelledby="notices-title">
            <h2 id="notices-title" className="dash__h2">
              Route advisories
            </h2>
            <NoticeList notices={notices} lastChecked={advisories.lastChecked} routeNames={routeNames} empty="" />
          </section>
        )}

        {choices.length > 0 && runAt !== null && (
          <RunTimePicker choices={choices} runAt={runAt} now={now} onPick={setPicked} />
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
            <section className="dash-hero" aria-labelledby="wear-title">
              <h2 id="wear-title" className="visually-hidden">
                What to wear
              </h2>
              <div className="duck-slot">
                {/* Decorative: the text below carries the meaning. */}
                <DressedDuck items={outfit.items.map((i) => i.id)} weather={duckWeather(outfit.conditions)} />
                <p className="duck-feels">
                  <span>Feels like</span> <strong>{degrees(hour.feelsC)}</strong>
                </p>
              </div>
              <p className="wear__headline">{outfit.headline}</p>
              <p className="wear__runfeel">
                Dress for {degrees(outfit.runFeelC)}: you warm up by about{' '}
                {degrees(outfit.runFeelC - hour.feelsC)} once you’re moving.
              </p>
              <ul className="wear__items">
                {outfit.items.map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ul>
            </section>

            <details className="dash-details">
              <summary>Weather details and tips</summary>
              <h3 className="dash-details__h3">Weather for {lowerDay(runTimeLabel(runAt, now))}</h3>
              <ul className="weather__facts">
                <li>
                  {weatherText(hour.code)}, air {degrees(hour.tempC)}, feels like {degrees(hour.feelsC)}
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
              <h3 className="dash-details__h3">Tips</h3>
              <ul className="wear__notes">
                {outfit.items
                  .filter((item) => item.why)
                  .map((item) => (
                    <li key={item.id}>
                      {item.label}: {item.why}.
                    </li>
                  ))}
                {outfit.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          </>
        )}

        {notices.length === 0 && (
          <p className="dash-clear">
            <span aria-hidden="true">✓ </span>No route advisories. <span className="dash-clear__checked">{lastCheckedText(advisories.lastChecked)}</span>
          </p>
        )}

        {!statusNeedsAttention && status}

        <p className="credits">
          Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0) from Environment and Climate
          Change Canada’s GEM model, for central Montréal. Your phone asks Open-Meteo directly, so they see an ordinary
          web request (such as your IP address), but never your GPS location.
        </p>
      </main>

      <footer className="footer">
        <p>ANYONE CAN RUN. ANYONE CAN PACE.</p>
      </footer>
    </div>
  );
}

/**
 * Run start as a strip of hour chips (6 a.m. to 9 p.m., a few days ahead),
 * scrolled so the chosen hour is in view. Native radios, so arrow keys and
 * screen readers work; each one's name includes the day ("Tomorrow 7 a.m.").
 */
function RunTimePicker(props: { choices: number[]; runAt: number; now: number; onPick: (at: number) => void }) {
  const { choices, runAt, now, onPick } = props;
  const days = useMemo(() => {
    const out: { date: string; label: string; hours: number[] }[] = [];
    for (const at of choices) {
      const h = localHour(at);
      if ((h < EARLIEST_RUN_HOUR || h > LATEST_RUN_HOUR) && at !== runAt) continue;
      const date = localDate(at);
      let day = out.at(-1);
      if (day?.date !== date) {
        if (out.length === PICKER_DAYS) break;
        day = { date, label: dayLabel(at, now), hours: [] };
        out.push(day);
      }
      day.hours.push(at);
    }
    return out;
  }, [choices, runAt, now]);

  const strip = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const el = strip.current;
    const chip = el?.querySelector('input:checked')?.parentElement;
    if (!el || !chip) return;
    const left = chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: scrolled.current && !reduce ? 'smooth' : 'instant' });
    scrolled.current = true;
  }, [runAt]);

  return (
    <div className="run-time">
      <p className="run-time__head" aria-hidden="true">
        <span>Run starts</span>
        <span className="run-time__picked">{runTimeLabel(runAt, now)}</span>
      </p>
      <div className="run-time__strip" role="radiogroup" aria-label="Run starts" ref={strip}>
        {days.map((day) => (
          <Fragment key={day.date}>
            <span className="run-time__day" aria-hidden="true">
              {day.label}
            </span>
            {day.hours.map((at) => (
              <label key={at} className="hour-chip">
                <input
                  type="radio"
                  name="run-time"
                  className="visually-hidden"
                  aria-label={`${day.label} ${hourLabel(at)}`}
                  value={at}
                  checked={at === runAt}
                  onChange={() => onPick(at)}
                />
                <span>{hourLabel(at)}</span>
              </label>
            ))}
          </Fragment>
        ))}
      </div>
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

/** "Today 10 a.m." → "today 10 a.m." (weekdays keep their capital). */
const lowerDay = (label: string) => label.replace(/^(Today|Tomorrow)/, (d) => d.toLowerCase());

/** "7:42 a.m.", "yesterday 7:42 a.m." or "Monday 7:42 a.m." */
function when(at: number, now: number): string {
  const day = dayLabel(at, now);
  if (day === 'Today') return clockTime(at);
  return `${day === 'Yesterday' || day === 'Tomorrow' ? day.toLowerCase() : day} ${clockTime(at)}`;
}

/** Ends with exactly one full stop ("a.m." already has one). */
const sentence = (s: string) => (s.endsWith('.') ? s : `${s}.`);
