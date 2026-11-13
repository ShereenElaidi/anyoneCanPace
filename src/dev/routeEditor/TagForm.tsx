/** "New tag": a label and one of the existing chip colours, with a preview chip. */
import { useState } from 'react';
import { TAG_LABEL_MAX, TAG_TONES, validateTagList, type TagTone } from '../../sixk/describe';
import { slugify } from './edits';
import type { TagList } from './types';

interface Props {
  tags: TagList;
  /** Called with the new tag's id and the whole list including it. */
  onAdd: (id: string, next: TagList) => Promise<void> | void;
  busy?: boolean;
}

export function TagForm({ tags, onAdd, busy }: Props) {
  const [label, setLabel] = useState('');
  const [tone, setTone] = useState<TagTone>('gold');
  const id = slugify(label);
  const next = { ...tags, [id]: { label: label.trim(), tone } };
  const problems = !label.trim()
    ? []
    : id in tags
      ? [`There is already a tag "${tags[id].label}".`]
      : validateTagList(next);
  const ready = !!label.trim() && !problems.length && !busy;

  return (
    <fieldset className="re-tagform">
      <legend>New tag</legend>
      <label className="re-field">
        <span>Label</span>
        <input value={label} maxLength={TAG_LABEL_MAX} onChange={(e) => setLabel(e.target.value)} placeholder="Hill repeats" />
      </label>
      <div className="re-radios" role="radiogroup" aria-label="Colour">
        {TAG_TONES.map((t) => (
          <label key={t} className="re-radio">
            <input type="radio" name="new-tag-tone" checked={tone === t} onChange={() => setTone(t)} />
            <span className={`tag tag--${t}`}>{t}</span>
          </label>
        ))}
      </div>
      {label.trim() && (
        <p className="re-hint">
          Preview: <span className={`tag tag--${tone}`}>{label.trim()}</span> · id <code>{id || '–'}</code> (never changes)
        </p>
      )}
      {problems.length > 0 && <p className="re-problem">{problems[0]}</p>}
      <button
        type="button"
        className="btn btn--small"
        disabled={!ready}
        onClick={async () => {
          await onAdd(id, next);
          setLabel('');
        }}
      >
        ADD TAG
      </button>
    </fieldset>
  );
}
