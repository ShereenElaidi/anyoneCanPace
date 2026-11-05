/**
 * Every route's own advisories (the `advisories` array hand-edited in
 * src/data/routes/<id>.json), as notices, so the dashboard shows the same
 * advisories the route pages do. Only that field is imported.
 */
import type { Advisory } from '../nav/types';
import type { Notice } from './notices';

const files = import.meta.glob<Advisory[]>(['../data/routes/*.json', '!../data/routes/manifest.json'], {
  eager: true,
  import: 'advisories',
});

export const ROUTE_NOTICES: Notice[] = Object.entries(files).flatMap(([path, advisories]) => {
  const id = path.replace(/^.*\/(.+)\.json$/, '$1');
  return (advisories ?? []).map((a, i) => ({ id: `${id}-${i}`, route: id, kind: 'manual' as const, ...a }));
});
