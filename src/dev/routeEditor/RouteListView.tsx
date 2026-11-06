/** The editor's home: every route with its status, Add a route, and the tag list. */
import { useEffect, useState } from 'react';
import { TAG_TONES, validateTagList, FILTER_TAGS, type TagTone } from '../../sixk/describe';
import { api, ApiError } from './client';
import { BuildLog, Errors, go, km, StatusBadge } from './shared';
import { TagForm } from './TagForm';
import type { BuildResult, RouteList, TagList } from './types';

export function RouteListView() {
  const [list, setList] = useState<RouteList | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [build, setBuild] = useState<BuildResult>();
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .listRoutes()
      .then(setList)
      .catch((e: unknown) => setErrors(e instanceof ApiError ? e.errors : [String(e)]));
  useEffect(() => {
    void load();
  }, []);

  const rebuild = async () => {
    setBusy(true);
    setErrors([]);
    try {
      setBuild((await api.build()).build);
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : [String(e)]);
      setBuild(e instanceof ApiError ? e.build : undefined);
    }
    setBusy(false);
    void load();
  };

  return (
    <>
      <section aria-labelledby="re-routes">
        <div className="re-row">
          <h2 id="re-routes">Routes</h2>
          <button type="button" className="btn btn--small" onClick={() => go('add')}>
            + ADD A ROUTE
          </button>
        </div>
        <Errors errors={errors} />
        {!list && !errors.length && <p>Loading…</p>}
        <ul className="re-list">
          {list?.routes.map((r) => (
            <li key={r.id}>
              <a className="re-card" href={`#route=${r.id}`}>
                <span className="re-card__name">{r.name}</span>
                <span className="re-card__meta">
                  {km(r.distanceM)} · {r.place ?? 'no place yet'} · <code>{r.id}</code>
                  {r.recorded ? ' · recorded run' : ''}
                </span>
                <span className="re-card__tags">
                  <StatusBadge status={r.verification} />
                  {r.tags.map((t) => (
                    <span key={t} className={`tag tag--${list.tags[t]?.tone ?? 'plain'}`}>
                      {list.tags[t]?.label ?? t}
                    </span>
                  ))}
                </span>
              </a>
            </li>
          ))}
        </ul>
        {list?.routes.some((r) => !r.built) && (
          <p className="re-problem">
            A route isn’t built yet (its last build failed).{' '}
            <button type="button" className="btn btn--small" disabled={busy} onClick={rebuild}>
              {busy ? 'BUILDING…' : 'BUILD AGAIN'}
            </button>
          </p>
        )}
        <BuildLog build={build} />
      </section>

      {list && <TagManager list={list} onSaved={load} />}
    </>
  );
}

/** Rename tags, change their colour, delete unused ones, add new ones. Saved to src/data/route-tags.json. */
function TagManager({ list, onSaved }: { list: RouteList; onSaved: () => void }) {
  const [draft, setDraft] = useState<TagList>(list.tags);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(list.tags), [list.tags]);

  const usedBy = (id: string) => list.routes.filter((r) => r.tags.includes(id)).map((r) => r.name);
  const dirty = JSON.stringify(draft) !== JSON.stringify(list.tags);
  const problems = validateTagList(draft);

  const save = async (next: TagList) => {
    setBusy(true);
    setErrors([]);
    setSaved(false);
    try {
      await api.saveTags(next);
      setSaved(true);
      onSaved();
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : [String(e)]);
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="re-tags">
      <h2 id="re-tags">Tags</h2>
      <p className="re-hint">
        Shown on library cards. Ids never change; the label and colour can. A tag can only be deleted when no route uses it.
      </p>
      <ul className="re-tags">
        {Object.entries(draft).map(([id, def]) => {
          const users = usedBy(id);
          const filter = (FILTER_TAGS as readonly string[]).includes(id);
          return (
            <li key={id}>
              <span className={`tag tag--${def.tone}`}>{def.label}</span>
              <label className="re-field re-field--inline">
                <span className="visually-hidden">Label for {id}</span>
                <input value={def.label} onChange={(e) => setDraft({ ...draft, [id]: { ...def, label: e.target.value } })} />
              </label>
              <label className="re-field re-field--inline">
                <span className="visually-hidden">Colour for {id}</span>
                <select value={def.tone} onChange={(e) => setDraft({ ...draft, [id]: { ...def, tone: e.target.value as TagTone } })}>
                  {TAG_TONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn--small btn--danger"
                disabled={users.length > 0 || filter}
                title={filter ? 'A “Show routes” filter uses this tag' : users.length ? `Used by ${users.join(', ')}` : undefined}
                onClick={() => {
                  const { [id]: _, ...rest } = draft;
                  setDraft(rest);
                }}
              >
                DELETE
              </button>
              <span className="re-hint">
                <code>{id}</code>
                {filter ? ' · filter' : ''}
                {users.length ? ` · ${users.join(', ')}` : ' · unused'}
              </span>
            </li>
          );
        })}
      </ul>
      {dirty && problems.length > 0 && <p className="re-problem">{problems[0]}</p>}
      <div className="re-row">
        <button type="button" className="btn btn--small" disabled={!dirty || problems.length > 0 || busy} onClick={() => save(draft)}>
          SAVE TAG CHANGES
        </button>
        {dirty && (
          <button type="button" className="btn btn--small" onClick={() => setDraft(list.tags)}>
            UNDO
          </button>
        )}
        {saved && !dirty && <span role="status">Saved.</span>}
      </div>
      <Errors errors={errors} />
      <TagForm tags={dirty ? draft : list.tags} busy={busy || dirty} onAdd={(_, next) => save(next)} />
      {dirty && <p className="re-hint">Save or undo the changes above before adding a tag.</p>}
    </section>
  );
}
