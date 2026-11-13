import { describe, expect, it } from 'vitest';
import realFile from '../data/advisories.json';
import manifest from '../data/routes/manifest.json';
import type { RouteData } from '../nav/types';
import { activeNotices, collectNotices, isActive, noticeProblems, routeNotices, type Notice } from './notices';

const routeIds = manifest.routes.map((r) => r.id);

const notices: Notice[] = [
  { id: 'all', route: 'global', text: 'Bring water: fountains are off for the winter.' },
  { id: 'commune', route: 'sample-loop', text: 'Commune Ouest closed for sewer work.', fromKm: 1.1, toKm: 2.1, start: '2026-10-30', end: '2026-11-06' },
  { id: 'old', route: 'sample-loop', text: 'Old detour.', end: '2026-10-01' },
  { id: 'soon', route: 'pi-day', text: 'Festival on Saint-Denis.', start: '2026-11-20', end: '2026-11-22' },
  { id: 'canal', route: 'canal-test', text: 'Bridge repainting.', start: '2026-11-01' },
];

describe('which notices show', () => {
  it('start and end days are inclusive; expired and future notices are hidden', () => {
    const n = notices[1];
    expect(isActive(n, '2026-10-29')).toBe(false);
    expect(isActive(n, '2026-10-30')).toBe(true);
    expect(isActive(n, '2026-11-06')).toBe(true);
    expect(isActive(n, '2026-11-07')).toBe(false); // expired: it disappears
    expect(isActive(notices[0], '2030-01-01')).toBe(true); // no dates: until removed
  });

  it('a route page shows its own notices first, then global ones', () => {
    expect(activeNotices(notices, 'sample-loop', '2026-11-04').map((n) => n.id)).toEqual(['commune', 'all']);
    expect(activeNotices(notices, 'pi-day', '2026-11-04').map((n) => n.id)).toEqual(['all']);
    expect(activeNotices(notices, 'pi-day', '2026-11-21').map((n) => n.id)).toEqual(['soon', 'all']);
  });

  it('the dashboard shows every active notice', () => {
    expect(activeNotices(notices, null, '2026-11-04').map((n) => n.id)).toEqual(['commune', 'canal', 'all']);
  });

  it('a route’s own advisories (in its JSON) join the central list', () => {
    const data = { id: 'pi-day', advisories: [{ text: 'Stairs at km 3.2', fromKm: 3.2 }] } as unknown as RouteData;
    const all = collectNotices(notices, routeNotices(data));
    expect(activeNotices(all, 'pi-day', '2026-11-04').map((n) => n.text)).toEqual(['Stairs at km 3.2', 'Bring water: fountains are off for the winter.']);
    expect(all.every((n) => n.kind === 'manual')).toBe(true);
  });
});

describe('checking the hand-edited file', () => {
  it('the real src/data/advisories.json is valid (a crew pull request with a typo fails the tests)', () => {
    expect(noticeProblems(realFile, routeIds)).toEqual([]);
  });

  it('explains mistakes in plain words', () => {
    const bad = {
      lastChecked: 'yesterday',
      notices: [
        { id: 'a', route: 'sample-loop', text: 'ok' },
        { id: 'a', route: 'sampel-loop', text: '', start: '2026-11-31x', end: '2026-01-01', source: 'www.example.com' },
      ],
    };
    const problems = noticeProblems(bad, routeIds);
    expect(problems).toEqual(
      expect.arrayContaining([
        'lastChecked must be a date like 2026-11-04.',
        'Notice 2 (a): id is used twice.',
        'Notice 2 (a): text is missing.',
        expect.stringMatching(/route "sampel-loop" is not "global" or a route id/),
        'Notice 2 (a): start must be a date like 2026-11-04.',
        'Notice 2 (a): source must be a web link.',
      ]),
    );
    expect(noticeProblems({ lastChecked: '2026-11-04', notices: [{ id: 'b', route: 'global', text: 'x', start: '2026-11-05', end: '2026-11-01' }] }, routeIds)).toEqual([
      'Notice 1 (b): end is before start.',
    ]);
    expect(noticeProblems(null, routeIds)).toHaveLength(1);
  });
});

describe('merging central and route advisories', () => {
  const central = {
    id: 'a',
    route: 'sample-loop',
    text: 'Sewer work on Rue de la Commune',
    start: '2026-11-01',
    end: '2026-11-30',
  };
  it('the same advisory in both places is shown once, keeping a source link', () => {
    const fromRoute = { ...central, id: 'sample-loop-0', text: ' sewer work on  rue de la Commune ', source: 'https://example.org' };
    const merged = collectNotices([central], [fromRoute]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('https://example.org');
    expect(merged[0].route).toBe('sample-loop');
  });

  it('different dates or stretches are different advisories', () => {
    expect(collectNotices([central], [{ ...central, id: 'b', end: '2026-12-15' }])).toHaveLength(2);
    expect(collectNotices([central], [{ ...central, id: 'c', fromKm: 1 }])).toHaveLength(2);
  });

  it('route advisories are kept with their route for attribution, and expire by date', () => {
    const merged = collectNotices([], routeNotices({ id: 'pi-day', advisories: [{ text: 'Bridge closed', end: '2026-11-10' }] } as RouteData));
    expect(activeNotices(merged, null, '2026-11-05').map((n) => n.route)).toEqual(['pi-day']);
    expect(activeNotices(merged, null, '2026-11-11')).toEqual([]);
  });
});
