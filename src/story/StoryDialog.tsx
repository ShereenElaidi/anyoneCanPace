import { useEffect, useRef, useState } from 'react';
import type { StorySnapshot } from './snapshot';
import { MONTREAL } from '../weather/forecast';

const stampFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MONTREAL.timeZone, weekday: 'long', hour: 'numeric', minute: '2-digit' });
/** A forecast older than this gets a "may be out of date" line. */
const OLD_MS = 6 * 3_600_000;
/** A run further ahead than this gets an "early forecast" line: the detailed models reach about 3 days. */
const EARLY_MS = 3 * 86_400_000;

type State = { kind: 'drawing' } | { kind: 'ready'; blob: Blob; url: string } | { kind: 'failed'; message: string };

interface Props {
  /** Frozen at MAKE STORY; null closes the dialog. */
  snapshot: StorySnapshot | null;
  onRemake: () => void;
  onClose: () => void;
}

/**
 * Preview, share and save for the Sunday story. The picture is drawn once per
 * snapshot, and SHARE / SAVE send that same picture, so what you see is what
 * you post. Sharing needs a tap (iPhone requires it), so the picture is ready
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
    let url = '';
    let cancelled = false;
    setState({ kind: 'drawing' });
    setNote('');
    import('./render')
      .then((m) => m.renderStory(snapshot))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ kind: 'ready', blob, url });
      })
      .catch((err: unknown) => !cancelled && setState({ kind: 'failed', message: String(err) }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [snapshot]);

  const fileName = snapshot ? `anyonecanpace-${snapshot.weekday.toLowerCase()}-${snapshot.run.date}.png` : 'story.png';
  const file = state.kind === 'ready' ? new File([state.blob], fileName, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
      setNote('Shared. Add the map link with a Link sticker.');
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
          {state.kind === 'ready' && snapshot && (
            <img
              src={state.url}
              alt={`Story: See you ${snapshot.weekday}. ${snapshot.outfit.headline} Meet at ${snapshot.place.name}.`}
            />
          )}
        </div>
        {state.kind === 'ready' && (
          <>
            <div className="story-sheet__actions">
              {canShare && (
                <button type="button" className="btn btn--primary" onClick={() => void share()}>
                  SHARE
                </button>
              )}
              <a className="btn btn--secondary" href={state.url} download={fileName}>
                SAVE IMAGE
              </a>
              <button type="button" className="btn btn--secondary" onClick={onRemake}>
                REMAKE
              </button>
            </div>
            <p className="story-sheet__hint">
              {canShare ? 'SHARE opens your phone’s share sheet (Instagram, Save Image…). ' : ''}
              Or press and hold the picture to save it.
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
