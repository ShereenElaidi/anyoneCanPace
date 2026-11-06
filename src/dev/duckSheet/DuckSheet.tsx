/**
 * Dev-only review page (`?duck-sheet`): every scenario in src/weather/scenarios.ts
 * dressed by the real rules and the real duck composer, plus a playground.
 * For checking the art and reviewing the rules with other runners (it prints).
 * main.tsx only loads it when `import.meta.env.DEV`, so it never ships.
 */
import { useMemo, useState } from 'react';
import { DressedDuck } from '../../dashboard/duck/DressedDuck';
import { whatToWear, type GarmentId, type Light, type OutfitInput } from '../../weather/outfit';
import { PRECIP, SCENARIOS, wx, type PrecipKind, type Season } from '../../weather/scenarios';
import { weatherText } from '../../weather/forecast';
import '../../dashboard/dashboard.css';
import './duckSheet.css';

const SEASONS: (Season | 'approved' | 'all')[] = ['all', 'approved', 'winter', 'spring', 'summer', 'fall'];

export default function DuckSheet() {
  const [season, setSeason] = useState<(typeof SEASONS)[number]>('all');
  const list = SCENARIOS.filter((sc) =>
    season === 'all' ? true : season === 'approved' ? sc.expected : sc.season === season && !sc.expected,
  );
  return (
    <div className="duck-sheet">
      <header className="duck-sheet__head">
        <h1>Duck sheet</h1>
        <p>
          Every review scenario, dressed by the real rules (<code>src/weather/outfit.ts</code>) and the real duck
          composer. Rules and sources: <code>design/weather-v1-spec.md</code>. Dev only.
        </p>
      </header>
      <Playground />
      <nav className="duck-sheet__filter" aria-label="Filter scenarios">
        {SEASONS.map((s) => (
          <button key={s} type="button" aria-pressed={season === s} onClick={() => setSeason(s)}>
            {s}
          </button>
        ))}
        <span>{list.length} scenarios</span>
      </nav>
      <div className="duck-sheet__grid">
        {list.map((sc) => (
          <Card key={sc.id} id={sc.id} title={sc.name} input={sc.input} expected={sc.expected} />
        ))}
      </div>
    </div>
  );
}

function Playground() {
  const [temp, setTemp] = useState(0);
  const [wind, setWind] = useState(10);
  const [precip, setPrecip] = useState<PrecipKind>('none');
  const [dew, setDew] = useState<number | ''>('');
  const [light, setLight] = useState<Light>('day');
  const [ground, setGround] = useState(false);
  const input = useMemo(
    () =>
      wx(temp, {
        wind,
        precip,
        dewPoint: dew === '' ? undefined : dew,
        light,
        snowDepthM: ground ? 0.1 : 0,
      }),
    [temp, wind, precip, dew, light, ground],
  );
  return (
    <section className="duck-sheet__play" aria-label="Playground">
      <div className="duck-sheet__controls">
        <label>
          Air {temp} °C
          <input type="range" min={-35} max={35} step={0.5} value={temp} onChange={(e) => setTemp(+e.target.value)} />
        </label>
        <label>
          Wind {wind} km/h
          <input type="range" min={0} max={60} step={1} value={wind} onChange={(e) => setWind(+e.target.value)} />
        </label>
        <label>
          Precipitation
          <select value={precip} onChange={(e) => setPrecip(e.target.value as PrecipKind)}>
            {Object.keys(PRECIP).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Dew point °C
          <input
            type="number"
            value={dew}
            placeholder="none"
            onChange={(e) => setDew(e.target.value === '' ? '' : +e.target.value)}
          />
        </label>
        <label>
          Light
          <select value={light} onChange={(e) => setLight(e.target.value as Light)}>
            <option>day</option>
            <option>dusk</option>
            <option>dark</option>
          </select>
        </label>
        <label className="duck-sheet__check">
          <input type="checkbox" checked={ground} onChange={(e) => setGround(e.target.checked)} /> Snow on the ground
        </label>
      </div>
      <Card id="▶" title="Playground" input={input} />
    </section>
  );
}

function Card(props: { id: string; title: string; input: OutfitInput; expected?: GarmentId[] }) {
  const { id, title, input, expected } = props;
  const o = whatToWear(input);
  const ids = o.wear.map((i) => i.id);
  const matches = expected ? expected.join() === ids.join() : null;
  const wind = input.windKmh === null ? 'wind ?' : `wind ${Math.round(input.windKmh)} km/h`;
  return (
    <article className="duck-sheet__card">
      <h2>
        <span className="duck-sheet__id">{id}</span> {title}
        {matches !== null && (
          <span className={`duck-sheet__badge duck-sheet__badge--${matches ? 'ok' : 'bad'}`}>
            {matches ? '✓ approved' : '✗ differs from approved'}
          </span>
        )}
      </h2>
      <p className="duck-sheet__wx">
        {weatherText(input.code)} · air {input.tempC} °C · feels {Math.round(input.feelsC)} °C · {wind}
        {o.windChillC !== null && ` · wind chill ${Math.round(o.windChillC)}`}
        {o.humidex !== null && ` · humidex ${Math.round(o.humidex)}`}
      </p>
      <div className="duck-sheet__duck">
        <DressedDuck items={o.drawn} weather={o.effect} />
      </div>
      <p className="wear__headline">{o.headline}</p>
      <ul className="wear__items">
        {o.wear.map((i) => (
          <li key={i.id}>{i.label}</li>
        ))}
      </ul>
      {matches === false && <p className="duck-sheet__expected">Approved: {expected!.join(', ')}</p>}
      {o.optional.length > 0 && (
        <ul className="wear__optional">
          {o.optional.map((x) => (
            <li key={x.id}>{x.text}</li>
          ))}
        </ul>
      )}
      {o.advisories.length > 0 && (
        <ul className="wear__advice">
          {o.advisories.map((a) => (
            <li key={a.text} className={`wear__advice--${a.level}`}>
              {a.level === 'warning' && <strong>Warning: </strong>}
              {a.text}
            </li>
          ))}
        </ul>
      )}
      {o.bring.length > 0 && <p className="duck-sheet__bring">Bring: {o.bring.join(' ')}</p>}
      <p className="duck-sheet__drawn">Duck: {o.drawn.join(', ') || 'base only'}</p>
    </article>
  );
}
