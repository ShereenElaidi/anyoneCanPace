/**
 * The JSON format of every generated or hand-edited data file (route files,
 * caches, review reports, the tag list), so files written by `npm run routes`
 * and by the dev route editor diff cleanly against each other.
 */

/** Pretty JSON, but short number arrays stay on one line. */
export function formatJson(value: unknown): string {
  return (
    JSON.stringify(value, null, 2).replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_, inner: string) =>
      `[${inner.split(/,\s+/).join(', ')}]`,
    ) + '\n'
  );
}
