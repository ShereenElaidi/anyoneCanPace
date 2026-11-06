import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sampleLoop from '../../data/routes/sample-loop.json';
import tags from '../../data/route-tags.json';
import RouteEditor from './RouteEditor';
import type { RouteData } from '../../nav/types';

const route = { ...(sampleLoop as unknown as RouteData), verification: { status: 'unverified' as const } };
const LIST = {
  today: '2026-11-05',
  tags,
  routes: [
    { id: 'sample-loop', name: 'Sample Loop', gpx: 'a.gpx', source: null, recorded: false, built: true, verification: 'field-verified', distanceM: 6358, place: 'Downtown → Old Port', tags: ['waterfront'] },
    { id: 'new-one', name: 'New One', gpx: 'b.gpx', source: null, recorded: true, built: false, verification: null, distanceM: null, place: null, tags: [] },
  ],
};
const DETAIL = { config: { id: 'sample-loop', gpx: 'a.gpx', name: 'Sample Loop' }, data: route, track: null, review: null, tags, today: '2026-11-05' };

let calls: { method: string; path: string; body?: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const path = url.replace('/__route-editor/api', '');
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, path, body });
      expect((init.headers as Record<string, string>)['x-route-editor']).toBe('1');
      const json =
        method === 'GET' && path === '/routes'
          ? LIST
          : method === 'GET'
            ? DETAIL
            : method === 'PUT' && path.startsWith('/routes/')
              ? { data: { ...route, ...body }, verificationReset: false, build: { ok: true, log: 'Wrote 3 route(s)' } }
              : { id: body?.id, points: 25, removed: ['25 timestamps'], build: { ok: true, log: 'ok' } };
      return new Response(JSON.stringify(json), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  location.hash = '';
});

const go = (hash: string) =>
  act(() => {
    const oldURL = location.href;
    location.hash = hash;
    dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: location.href }));
  });

describe('route editor', () => {
  it('lists the routes with their review status and flags an unbuilt one', async () => {
    render(<RouteEditor />);
    expect(await screen.findByText('Sample Loop')).toBeTruthy();
    expect(screen.getByText(/Field-verified/)).toBeTruthy();
    expect(screen.getByText('Not built')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'BUILD AGAIN' })).toBeTruthy();
  });

  it('saves only the fields that changed', async () => {
    location.hash = '#route=sample-loop';
    render(<RouteEditor />);
    const description = await screen.findByLabelText(/Description/);
    expect(screen.getByRole('button', { name: 'NO CHANGES' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(description, { target: { value: '  Flat and shaded.  ' } });
    fireEvent.click(screen.getByLabelText('Good first route'));
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));
    await screen.findByText(/Saved, and the library list is rebuilt/);
    const put = calls.find((c) => c.method === 'PUT');
    expect(put).toEqual({
      method: 'PUT',
      path: '/routes/sample-loop',
      // Tags keep the tag list's order (good-first-route comes before waterfront).
      body: { description: 'Flat and shaded.', tags: ['good-first-route', 'waterfront'] },
    });
  });

  it('refuses a description over 280 characters before sending it', async () => {
    location.hash = '#route=sample-loop';
    render(<RouteEditor />);
    fireEvent.change(await screen.findByLabelText(/Description/), { target: { value: 'x'.repeat(281) } });
    expect(screen.getByText(/at most 280/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'SAVE' }).hasAttribute('disabled')).toBe(true);
  });

  it('asks before leaving a route with unsaved changes', async () => {
    location.hash = '#route=sample-loop';
    render(<RouteEditor />);
    fireEvent.change(await screen.findByLabelText(/Description/), { target: { value: 'Draft' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    go('');
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText(/Description/)).toBeTruthy(); // still on the route
    expect(location.hash).toBe('#route=sample-loop');
    confirm.mockRestore();
  });

  it('adds a route only once everything is filled in, with a cleaned id and the chosen source', async () => {
    location.hash = '#add';
    render(<RouteEditor />);
    const add = await screen.findByRole('button', { name: 'ADD ROUTE' });
    await waitFor(() => expect(calls.some((c) => c.path === '/routes')).toBe(true));
    const gpx = new File(['<gpx><trk><trkseg><trkpt lat="45" lon="-73"/><trkpt lat="45.1" lon="-73.1"/></trkseg></trk></gpx>'], 'run.gpx');
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [gpx] } });
    await screen.findByText(/run\.gpx/);
    fireEvent.change(screen.getByLabelText('Route name'), { target: { value: 'Canal à l’aube' } });
    fireEvent.click(screen.getByLabelText('Strava'));
    fireEvent.change(screen.getByLabelText('Drawn by (optional)'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByLabelText('Recorded on a run'));
    expect(add.hasAttribute('disabled')).toBe(true); // public places not confirmed yet
    fireEvent.click(screen.getByLabelText(/public places/));
    expect(add.hasAttribute('disabled')).toBe(false);
    fireEvent.click(add);
    await screen.findByText(/Added\./);
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      id: 'canal-a-l-aube',
      name: 'Canal à l’aube',
      recorded: true,
      source: { name: 'Strava', url: 'https://www.strava.com', attribution: 'Route from Strava · drawn by Sam' },
    });
  });

  it('won’t reuse an existing id', async () => {
    location.hash = '#add';
    render(<RouteEditor />);
    await waitFor(() => expect(calls.some((c) => c.path === '/routes')).toBe(true));
    fireEvent.change(await screen.findByLabelText('Route name'), { target: { value: 'Sample Loop' } });
    expect(await screen.findByText('there is already a route with the id "sample-loop"')).toBeTruthy();
  });
});
