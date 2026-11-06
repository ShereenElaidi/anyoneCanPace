import { useEffect, useRef, useState } from 'react';
import type { StorySnapshot } from './snapshot';
import { MONTREAL } from '../weather/forecast';

const stampFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long', hour: 'numeric', minute: '2-digit' });
/** A forecast older than this gets a "may be out of date" line. */
const OLD_MS = 6 * 3_600_000;
/** A run further ahead than this gets an "early forecast" line: the detailed models reach about 3 days. */
const EARLY_MS = 3 * 86_400_000;

type State = { kind: 'drawing' } | { kind: 'ready'; blobs: Blob[]; urls: string[] } | { kind: 'failed'; message: string };

interface Props {
  /** Frozen at MAKE STORY; null closes the dialog. */
  snapshot: StorySnapshot | null;
  onRemake: () => void;
  onClose: () => void;
}

/**
 * Preview, share and save for the Sunday story: two pages, the poster and
 * the map. They're drawn once per snapshot, and SHARE / SAVE send those same
 * pictures, so what you see is what you post. Sharing needs a tap (iPhone requires it), so the picture is ready
 * before the buttons appear.
 */
export default function StoryDialog({ snapshot, onRemake, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ kind: 'drawing' });
  const [note, setNote] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (snapshot && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!snapshot && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    let urls: string[] = [];
    let cancelled = false;
    setState({ kind: 'drawing' });
    setNote('');
    import('./render')
      .then((m) => m.renderStory(snapshot))
      .then((blobs) => {
        if (cancelled) return;
        urls = blobs.map((b) => URL.createObjectURL(b));
        setState({ kind: 'ready', blobs, urls });
      })
      .catch((err: unknown) => !cancelled && setState({ kind: 'failed', message: String(err) }));
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [snapshot]);

  const base = snapshot ? `anyonecanpace-${snapshot.weekday.toLowerCase()}-${snapshot.run.date}` : 'story';
  const fileNames = [`${base}-1.png`, `${base}-2-map.png`];
  const files = state.kind === 'ready' ? state.blobs.map((b, i) => new File([b], fileNames[i], { type: 'image/png' })) : [];
  const canShare = files.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files });
  const alts = snapshot
    ? [
        `Story page 1: See you ${snapshot.weekday}. ${snapshot.outfit.headline} Meet at ${snapshot.place.name}.`,
        `Story page 2: Lost? Find your Flock! Map to ${snapshot.place.name}, ${snapshot.place.address}.`,
      ]
    : [];

  async function share() {
    if (!files.length) return;
    try {
      await navigator.share({ files });
      setNote('Shared. On the map page, add the map link with a Link sticker under the map.');
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') setNote('Couldn’t share. Use SAVE IMAGE, or press and hold the picture.');
    }
  }

  const old = snapshot ? snapshot.madeAt - snapshot.forecastFetchedAt > OLD_MS : false;
  const early = snapshot ? snapshot.run.startAt - snapshot.forecastFetchedAt > EARLY_MS : false;

  return (
    <dialog
      ref={ref}
      className="sheet story-sheet"
      aria-labelledby="story-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet__body">
        <div className="sheet__head">
          <h2 id="story-title" className="dash__h2">
            Sunday story
          </h2>
          <button type="button" className="btn btn--secondary btn--small" onClick={onClose}>
            CLOSE
          </button>
        </div>
        {snapshot && (
          <p className="story-sheet__meta">
            Forecast from {stampFmt.format(snapshot.forecastFetchedAt).replace(/\.$/, '')}.{old ? ' It may be out of date: REFRESH the dashboard, then REMAKE.' : ''}
            {early && ' Early forecast: it can still change. Check again on Saturday and REMAKE if it did.'}
          </p>
        )}
        <div className="story-sheet__preview">
          {state.kind === 'drawing' && <p role="status">Drawing the story…</p>}
          {state.kind === 'failed' && <p role="alert">Couldn’t draw the story. {state.message}</p>}
          {state.kind === 'ready' &&
            state.urls.map((u, i) => (
              <figure key={u} className="story-sheet__page">
                <img src={u} alt={alts[i]} />
                <a className="btn btn--secondary btn--small" href={u} download={fileNames[i]}>
                  SAVE PAGE {i + 1}
                </a>
              </figure>
            ))}
        </div>
        {state.kind === 'ready' && (
          <>
            <div className="story-sheet__actions">
              {canShare && (
                <button type="button" className="btn btn--primary" onClick={() => void share()}>
                  SHARE
                </button>
              )}
              <button type="button" className="btn btn--secondary" onClick={onRemake}>
                REMAKE
              </button>
            </div>
            <p className="story-sheet__hint">
              {canShare ? 'SHARE sends both pages to your phone’s share sheet (Instagram, Save Images…). ' : ''}
              Post them in order. Or press and hold a picture to save it.
            </p>
          </>
        )}
        <p className="story-sheet__hint" aria-live="polite">
          {note}
        </p>
      </div>
    </dialog>
  );
}
