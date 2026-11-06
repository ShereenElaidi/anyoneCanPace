/**
 * Add a route: a GPX file, a name and id, where it came from, and whether it
 * was drawn or recorded. The server cleans the GPX (keeps only track points),
 * adds it to routes/routes.config.json and runs `npm run routes`.
 */
import { useEffect, useState, type DragEvent } from 'react';
import { api, ApiError } from './client';
import { NAME_MAX, slugify, validateNewRouteId } from './edits';
import { BuildLog, Errors, go } from './shared';
import { otherSource, SOURCE_PRESETS, withDrawnBy } from './sources';
import type { AddRouteResult, BuildResult } from './types';

const MAX_BYTES = 8 * 1024 * 1024;

export function AddRouteView() {
  const [existing, setExisting] = useState<string[]>([]);
  const [file, setFile] = useState<{ name: string; size: number; text: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [preset, setPreset] = useState('');
  const [other, setOther] = useState({ name: '', url: '', attribution: '' });
  const [drawnBy, setDrawnBy] = useState('');
  const [recorded, setRecorded] = useState<boolean | null>(null);
  const [publicPlaces, setPublicPlaces] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [build, setBuild] = useState<BuildResult>();
  const [result, setResult] = useState<AddRouteResult | null>(null);

  useEffect(() => {
    api
      .listRoutes()
      .then((l) => setExisting(l.routes.map((r) => r.id)))
      .catch(() => {});
  }, []);

  const routeId = idTouched ? id : slugify(name);
  const idProblems = name || idTouched ? validateNewRouteId(routeId, existing) : [];
  const baseSource =
    preset === 'other'
      ? otherSource(other.name, other.url, other.attribution)
      : SOURCE_PRESETS.find((p) => p.id === preset)?.source;
  const source = baseSource && withDrawnBy(baseSource, drawnBy);
  const sourceOk = !!source && !!source.name && (preset !== 'other' || !other.url.trim() || /^https:\/\/\S+$/.test(other.url.trim()));
  const ready =
    !!file && !!name.trim() && !idProblems.length && sourceOk && recorded !== null && publicPlaces && !busy && !result;

  const pick = async (f: File | undefined) => {
    setFileError('');
    if (!f) return;
    if (!/\.gpx$/i.test(f.name)) return setFileError('Choose a .gpx file.');
    if (f.size > MAX_BYTES) return setFileError('That file is larger than 8 MB.');
    const text = await f.text();
    if (!/<(trkpt|rtept)\b/.test(text)) return setFileError('This file has no track points.');
    setFile({ name: f.name, size: f.size, text });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void pick(e.dataTransfer.files[0]);
  };

  const submit = async () => {
    if (!file || !source || recorded === null) return;
    setBusy(true);
    setErrors([]);
    setBuild(undefined);
    try {
      const r = await api.addRoute({ id: routeId, name: name.trim(), gpx: file.text, source, recorded });
      setResult(r);
      setBuild(r.build);
    } catch (e) {
      if (e instanceof ApiError && e.build) {
        // The GPX and config entry were saved; only the build failed.
        setResult({ id: routeId, points: 0, removed: [], build: e.build });
        setBuild(e.build);
      } else {
        setErrors(e instanceof ApiError ? e.errors : [String(e)]);
      }
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="re-add">
      <div className="re-row">
        <h2 id="re-add">Add a route</h2>
        <a className="btn btn--small" href="#">
          ‹ ROUTES
        </a>
      </div>

      <fieldset className="re-group" disabled={busy || !!result}>
        <legend>1. GPX file</legend>
        <label className="re-drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <input type="file" accept=".gpx,application/gpx+xml" onChange={(e) => void pick(e.target.files?.[0])} />
          <span>{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'Drop a .gpx file here, or click to choose one'}</span>
        </label>
        {fileError && <p className="re-problem">{fileError}</p>}
        <p className="re-hint">
          Before saving, the file is cleaned: only the track points (latitude, longitude, elevation) are kept. Times, heart rate,
          device data, waypoints and the file’s own names are removed, because the repository is public.
        </p>
      </fieldset>

      <fieldset className="re-group" disabled={busy || !!result}>
        <legend>2. Name</legend>
        <label className="re-field">
          <span>Route name</span>
          <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Canal at Dawn" />
        </label>
        <label className="re-field">
          <span>Id (used in file names and links; can’t change later)</span>
          <input
            value={routeId}
            onChange={(e) => {
              setIdTouched(true);
              setId(e.target.value);
            }}
          />
        </label>
        {idProblems.length > 0 && <p className="re-problem">{idProblems[0]}</p>}
      </fieldset>

      <fieldset className="re-group" disabled={busy || !!result}>
        <legend>3. Where it comes from</legend>
        <div className="re-radios">
          {[...SOURCE_PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: 'other', label: 'Other' }].map((p) => (
            <label key={p.id} className="re-radio re-radio--box">
              <input type="radio" name="source" checked={preset === p.id} onChange={() => setPreset(p.id)} />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
        {preset === 'other' && (
          <>
            <label className="re-field">
              <span>Name</span>
              <input value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} placeholder="Komoot" />
            </label>
            <label className="re-field">
              <span>Link (optional, https://)</span>
              <input value={other.url} onChange={(e) => setOther({ ...other, url: e.target.value })} />
            </label>
            <label className="re-field">
              <span>Credit line</span>
              <input
                value={other.attribution}
                onChange={(e) => setOther({ ...other, attribution: e.target.value })}
                placeholder={other.name ? `Route from ${other.name}` : ''}
              />
            </label>
          </>
        )}
        <label className="re-field">
          <span>Drawn by (optional)</span>
          <input value={drawnBy} onChange={(e) => setDrawnBy(e.target.value)} />
        </label>
        <p className="re-hint">Only name someone who agreed to be credited: the credit line is public.</p>
        {source && (
          <p className="re-hint">
            Credit on the route page: <em>{source.attribution}</em>
          </p>
        )}
      </fieldset>

      <fieldset className="re-group" disabled={busy || !!result}>
        <legend>4. Drawn or recorded?</legend>
        <label className="re-radio re-radio--box">
          <input type="radio" name="kind" checked={recorded === false} onChange={() => setRecorded(false)} />
          <span>Drawn on a map</span>
        </label>
        <label className="re-radio re-radio--box">
          <input type="radio" name="kind" checked={recorded === true} onChange={() => setRecorded(true)} />
          <span>Recorded on a run</span>
        </label>
        {recorded && (
          <p className="re-hint">GPS wobble on a recorded run can look like turns. The turn list will flag this route for a closer check.</p>
        )}
        <label className="re-check">
          <input type="checkbox" checked={publicPlaces} onChange={(e) => setPublicPlaces(e.target.checked)} />
          <span>The start and finish are public places (not someone’s home).</span>
        </label>
      </fieldset>

      <Errors errors={errors} />
      {!result && (
        <button type="button" className="btn btn--primary btn--block" disabled={!ready} onClick={submit}>
          {busy ? 'BUILDING…' : 'ADD ROUTE'}
        </button>
      )}
      {busy && (
        <p className="re-hint" role="status">
          Cleaning the GPX and building. A new route looks up elevation and street names online: this can take a minute.
        </p>
      )}

      {result && (
        <div className="re-done" role="status">
          {result.build.ok ? (
            <>
              <p>
                <strong>Added.</strong> {result.points} track points kept.
                {result.removed.length ? ` Removed from the file: ${result.removed.join(', ')}.` : ' Nothing else was in the file.'}
              </p>
              <p>The route is unverified until someone checks its turns.</p>
              <button type="button" className="btn btn--small" onClick={() => go(`route=${result.id}`)}>
                EDIT ITS DETAILS ›
              </button>
            </>
          ) : (
            <p>
              The GPX and config entry were saved, but the build failed. Fix the problem in the log (often a network lookup),
              then use BUILD AGAIN on the route list.
            </p>
          )}
        </div>
      )}
      <BuildLog build={build} />
    </section>
  );
}
