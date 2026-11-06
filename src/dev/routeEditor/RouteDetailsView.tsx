/**
 * A route's hand-written details: name, place, description, tags, notes and
 * start street. Saving sends only what changed; the server checks it with the
 * same rules (edits.ts) and rebuilds offline. Turns, advisories and the review
 * get their own panels in later steps.
 */
import { useEffect, useState } from 'react';
import type { RouteData, Turn } from '../../nav/types';
import { DESCRIPTION_MAX, validateDescription } from '../../sixk/describe';
import { api, ApiError } from './client';
import { NAME_MAX, PLACE_MAX, validateAdvisories, validateTurns, type RouteEdits } from './edits';
import { AdvisoriesEditor } from './AdvisoriesEditor';
import { ReviewPanel } from './ReviewPanel';
import { advisoryToForm, formToAdvisory, mapCoverage, type AdvisoryForm } from './review';
import { TurnEditor } from './TurnEditor';
import { normalizeTurns } from './turnEdit';
import { BuildLog, Errors, km, setLeaveGuard, StatusBadge } from './shared';
import { TagForm } from './TagForm';
import type { BuildResult, RouteDetail, TagList } from './types';

interface Form {
  name: string;
  place: string;
  description: string;
  tags: string[];
  notes: string;
  startStreet: string;
  turns: Turn[];
  advisories: AdvisoryForm[];
}

const toForm = (d: RouteData): Form => ({
  name: d.name,
  place: d.place ?? '',
  description: d.description ?? '',
  tags: d.tags ?? [],
  notes: d.notes.join('\n'),
  startStreet: d.startStreet ?? '',
  turns: d.turns,
  advisories: d.advisories.map(advisoryToForm),
});

/** Only the fields that changed, in the shape the server expects. */
function changes(form: Form, d: RouteData): RouteEdits {
  const before = toForm(d);
  const edits: RouteEdits = {};
  if (form.name.trim() !== before.name) edits.name = form.name.trim();
  if (form.place.trim() !== before.place) edits.place = form.place.trim();
  if (form.description.trim() !== before.description) edits.description = form.description.trim();
  if (JSON.stringify(form.tags) !== JSON.stringify(before.tags)) edits.tags = form.tags;
  const notes = form.notes
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);
  if (JSON.stringify(notes) !== JSON.stringify(d.notes)) edits.notes = notes;
  if (form.startStreet.trim() !== before.startStreet) edits.startStreet = form.startStreet.trim();
  const turns = normalizeTurns(form.turns);
  if (JSON.stringify(turns) !== JSON.stringify(d.turns)) edits.turns = turns;
  const advisories = form.advisories.map(formToAdvisory);
  if (JSON.stringify(advisories) !== JSON.stringify(d.advisories)) edits.advisories = advisories;
  return edits;
}

export function RouteDetailsView({ id }: { id: string }) {
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [tags, setTags] = useState<TagList>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [build, setBuild] = useState<BuildResult>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<'inside' | 'partly' | 'outside' | null>(null);

  const load = () =>
    api
      .getRoute(id)
      .then((d) => {
        setDetail(d);
        setTags(d.tags);
        if (d.data) setForm(toForm(d.data));
      })
      .catch((e: unknown) => setErrors(e instanceof ApiError ? e.errors : [String(e)]));
  useEffect(() => {
    void load();
  }, [id]);

  const data = detail?.data ?? null;

  // Is the route on the offline street map (public/maps/montreal.pmtiles)? Read from the file's header.
  const bboxKey = data?.bbox.join(',');
  useEffect(() => {
    if (!data) return;
    let stale = false;
    void (async () => {
      try {
        const [{ PMTiles, FetchSource }, { mapUrl }] = await Promise.all([import('pmtiles'), import('../../sixk/map/offlineMap')]);
        const h = await new PMTiles(new FetchSource(mapUrl())).getHeader();
        if (!stale) setCoverage(mapCoverage(data.bbox, { minLon: h.minLon, minLat: h.minLat, maxLon: h.maxLon, maxLat: h.maxLat }));
      } catch {
        if (!stale) setCoverage(null);
      }
    })();
    return () => {
      stale = true;
    };
    // Only when the route's box changes.
  }, [bboxKey]);
  const edits = form && data ? changes(form, data) : {};
  const dirty = Object.keys(edits).length > 0;

  // Warn before leaving with unsaved changes (reload, close, or the ‹ ROUTES link).
  useEffect(() => {
    if (!dirty) return;
    const stay = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', stay);
    const release = setLeaveGuard(() => confirm('Leave without saving your changes?'));
    return () => {
      removeEventListener('beforeunload', stay);
      release();
    };
  }, [dirty]);

  if (!detail || !form || !data) {
    return (
      <section>
        <a className="btn btn--small" href="#">
          ‹ ROUTES
        </a>
        <Errors errors={errors} />
        {detail && !data && <p>This route isn’t built yet. Use BUILD AGAIN on the route list.</p>}
        {!detail && !errors.length && <p>Loading…</p>}
      </section>
    );
  }

  const reviewed = data.verification.status !== 'unverified';
  const descriptionProblem = form.description.trim() ? validateDescription(form.description.trim())[0] : undefined;
  const turnProblem = validateTurns(normalizeTurns(form.turns), data.stats.distanceM)[0];
  const advisoryProblem = validateAdvisories(form.advisories.map(formToAdvisory), id, data.stats.distanceM, detail.today)[0];
  const directionsChanged = 'turns' in edits || 'startStreet' in edits;
  const set = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setNotice('');
  };

  const save = async () => {
    setBusy(true);
    setErrors([]);
    setBuild(undefined);
    try {
      const r = await api.saveRoute(id, edits);
      setBuild(r.build);
      setNotice(
        r.verificationReset
          ? 'Saved. The turns or start street changed, so this route is unverified again until someone checks it.'
          : 'Saved, and the library list is rebuilt.',
      );
      await load();
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : [String(e)]);
      setBuild(e instanceof ApiError ? e.build : undefined);
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="re-route">
      <div className="re-row">
        <a className="btn btn--small" href="#">
          ‹ ROUTES
        </a>
        <a className="btn btn--small" href={`${import.meta.env.BASE_URL}?sim=${id}`} target="_blank" rel="noreferrer">
          TRY IN SIMULATOR ↗
        </a>
      </div>
      <h2 id="re-route">{data.name}</h2>
      <p className="re-hint">
        <code>{id}</code> · {km(data.stats.distanceM)} · ↑ {data.stats.gainM} m · {data.turns.length} turns ·{' '}
        <StatusBadge status={data.verification.status} />
        {detail.config.recorded ? ' · recorded run' : ''}
      </p>
      {data.source && <p className="re-hint">Credit: {data.source.attribution}</p>}
      {coverage && coverage !== 'inside' && (
        <p className="re-problem">
          {coverage === 'outside' ? 'This route is outside' : 'Part of this route is outside'} the offline street map. Run{' '}
          <code>npm run map</code> to re-cut it around every route, then bump <code>MAP_VERSION</code> in{' '}
          <code>src/sixk/map/offlineMap.ts</code> so phones fetch the new file.
        </p>
      )}

      <div className="re-group">
        <label className="re-field">
          <span>Name</span>
          <input value={form.name} maxLength={NAME_MAX} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="re-field">
          <span>Place (library card, e.g. “Downtown · Old Port”)</span>
          <input value={form.place} maxLength={PLACE_MAX} onChange={(e) => set({ place: e.target.value })} />
        </label>
        <label className="re-field">
          <span>
            Description (route page) · {form.description.trim().length}/{DESCRIPTION_MAX}
          </span>
          <textarea rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        {descriptionProblem && <p className="re-problem">{descriptionProblem}</p>}
      </div>

      <fieldset className="re-group">
        <legend>Tags</legend>
        <div className="re-radios">
          {Object.entries(tags).map(([tagId, def]) => (
            <label key={tagId} className="re-radio">
              <input
                type="checkbox"
                checked={form.tags.includes(tagId)}
                onChange={(e) =>
                  set({
                    // Keep the tag list's order, so saving doesn't shuffle them.
                    tags: Object.keys(tags).filter((t) => (t === tagId ? e.target.checked : form.tags.includes(t))),
                  })
                }
              />
              <span className={`tag tag--${def.tone}`}>{def.label}</span>
            </label>
          ))}
        </div>
        <TagForm
          tags={tags}
          busy={busy}
          onAdd={async (tagId, next) => {
            try {
              const r = await api.saveTags(next);
              setTags(r.tags);
              set({ tags: Object.keys(r.tags).filter((t) => t === tagId || form.tags.includes(t)) });
            } catch (e) {
              setErrors(e instanceof ApiError ? e.errors : [String(e)]);
            }
          }}
        />
        <p className="re-hint">A new tag is saved to the tag list at once; ticking it here still needs SAVE.</p>
      </fieldset>

      <div className="re-group">
        <label className="re-field">
          <span>Notes (route page, one per line: water, toilets, crossings)</span>
          <textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <label className="re-field">
          <span>Start street (“Continue on …” before the first turn)</span>
          <input value={form.startStreet} onChange={(e) => set({ startStreet: e.target.value })} />
        </label>
        {detail.review?.startStreet !== undefined && detail.review.startStreet !== form.startStreet && (
          <p className="re-hint">The build suggests “{detail.review.startStreet || '(none)'}”.</p>
        )}
      </div>

      {detail.track ? (
        <TurnEditor
          data={data}
          track={detail.track}
          candidates={detail.review?.turns ?? []}
          recorded={!!detail.config.recorded}
          turns={form.turns}
          onChange={(turns) => set({ turns })}
        />
      ) : (
        <p className="re-problem">The track file is missing, so turns can’t be edited. Rebuild the route.</p>
      )}

      <AdvisoriesEditor
        routeId={id}
        distanceM={data.stats.distanceM}
        today={detail.today}
        advisories={form.advisories}
        onChange={(advisories) => set({ advisories })}
      />

      {reviewed && directionsChanged && (
        <p className="re-problem" role="status">
          This route is {data.verification.status}. Saving changed turns or start street makes it unverified again until someone
          checks it.
        </p>
      )}

      <Errors errors={errors} />
      {notice && (
        <p className="re-done" role="status">
          {notice}
        </p>
      )}
      <div className="re-row re-sticky">
        <button type="button" className="btn btn--primary" disabled={!dirty || busy || !!descriptionProblem || !!turnProblem || !!advisoryProblem} onClick={save}>
          {busy ? 'SAVING…' : dirty ? 'SAVE' : 'NO CHANGES'}
        </button>
        {dirty && (
          <button type="button" className="btn btn--small" disabled={busy} onClick={() => setForm(toForm(data))}>
            UNDO CHANGES
          </button>
        )}
      </div>
      <BuildLog build={build} />

      <ReviewPanel data={data} today={detail.today} dirty={dirty} onSaved={load} />
    </section>
  );
}
