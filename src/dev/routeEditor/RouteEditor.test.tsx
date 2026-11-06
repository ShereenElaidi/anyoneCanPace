import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sampleLoop from '../../data/routes/sample-loop.json';
import tags from '../../data/route-tags.json';
import sampleTrack from '../../data/routes/sample-loop.geojson?raw';
import RouteEditor from './RouteEditor';
import type { RouteData, TrackFeature } from '../../nav/types';
import type { LatLon } from '../../nav/geo';

// MapLibre needs WebGL, which jsdom doesn't have: a stand-in map that can "click" a place.
vi.mock('./EditorMap', () => ({
  default: ({ onMapClick, onSelect }: { onMapClick: (p: LatLon) => void; onSelect: (i: number) => void }) => (
    <div>
      <button type="button" onClick={() => onMapClick(clickAt)}>
        click the map
      </button>
      <button type="button" onClick={() => onSelect(1)}>
        click turn 2 on the map
      </button>
    </div>
  ),
}));
let clickAt: LatLon = { lat: 0, lon: 0 };

const route = { ...(sampleLoop as unknown as RouteData), verification: { status: 'unverified' as const } };
const LIST = {
  today: '2026-11-05',
  tags,
  routes: [
    { id: 'sample-loop', name: 'Sample Loop', gpx: 'a.gpx', source: null, recorded: false, built: true, verification: 'field-verified', distanceM: 6358, place: 'Downtown → Old Port', tags: ['waterfront'] },
    { id: 'new-one', name: 'New One', gpx: 'b.gpx', source: null, recorded: true, built: false, verification: null, distanceM: null, place: null, tags: [] },
  ],
};
const track = JSON.parse(sampleTrack) as TrackFeature;
const DETAIL = {
  config: { id: 'sample-loop', gpx: 'a.gpx', name: 'Sample Loop', recorded: true },
  data: route,
  track,
  review: { turns: [{ atM: route.turns[0].atM + 5, dir: 'sharp-left', decision: 'retained', needsReview: true, reason: 'street changes', streetAfter: 'Rue X' }] },
  tags,
  today: '2026-11-05',
};

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

  describe('turns', () => {
    const open = async () => {
      location.hash = '#route=sample-loop';
      render(<RouteEditor />);
      return screen.findByRole('heading', { name: /^Turns/ });
    };

    it('shows the build’s flag next to a turn, and warns about a recorded run', async () => {
      await open();
      expect(screen.getByText(/1 flagged by the build/)).toBeTruthy();
      expect(screen.getByText(/The build flagged this one: street changes/)).toBeTruthy();
      expect(screen.getByText(/It would say “sharp-left onto Rue X”/)).toBeTruthy();
      expect(screen.getByText(/Recorded run: GPS wobble/)).toBeTruthy();
    });

    it('deletes a turn and saves the list without it', async () => {
      await open();
      fireEvent.click(screen.getByRole('button', { name: 'DELETE TURN 1' }));
      fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));
      await screen.findByText(/Saved/);
      const put = calls.find((c) => c.method === 'PUT')!.body as { turns: unknown[] };
      expect(put.turns).toEqual(route.turns.slice(1));
    });

    it('adds a turn where the route was clicked, with a guessed direction, and trims the street on save', async () => {
      await open();
      // Just off the route, a little after the first turn.
      const along = route.turns[0].atM + 120;
      const { prepareRoute, pointAt } = await import('../../nav/route');
      const { offsetPoint } = await import('../../nav/geo');
      clickAt = offsetPoint(pointAt(prepareRoute(track.geometry.coordinates), along), 0, 3);
      fireEvent.click(await screen.findByRole('button', { name: 'click the map' }));
      const add = await screen.findByRole('button', { name: /^\+ .* at / });
      const index = route.turns.filter((t) => t.atM < along).length; // where the new turn lands in the list
      fireEvent.click(add);
      expect(screen.getByRole('heading', { name: /^Turns/ }).textContent).toContain(`Turns (${route.turns.length + 1})`);
      fireEvent.change(screen.getAllByLabelText('Street you turn onto')[index], { target: { value: '  Rue Peel ' } });
      fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));
      await screen.findByText(/Saved/);
      const turns = (calls.find((c) => c.method === 'PUT')!.body as { turns: { atM: number; street: string }[] }).turns;
      expect(turns).toHaveLength(route.turns.length + 1);
      expect(Math.abs(turns[index].atM - along)).toBeLessThanOrEqual(10);
      expect(turns[index].street).toBe('Rue Peel');
    });

    it('says when a click is too far from the route', async () => {
      await open();
      clickAt = { lat: 45.6, lon: -73.4 };
      fireEvent.click(await screen.findByRole('button', { name: 'click the map' }));
      expect(await screen.findByText(/more than 40 m from the route/)).toBeTruthy();
    });

    it('selects a turn from the map', async () => {
      await open();
      fireEvent.click(await screen.findByRole('button', { name: 'click turn 2 on the map' }));
      expect(screen.getByRole('button', { name: 'Show turn 2 on the map' }).getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('review and advisories', () => {
    const open = async () => {
      location.hash = '#route=sample-loop';
      render(<RouteEditor />);
      return screen.findByRole('heading', { name: /^Review/ });
    };

    it('marks a route reviewed only with who, when and an explicit confirmation, then shows the test line', async () => {
      await open();
      fireEvent.click(screen.getByLabelText('Desk-reviewed'));
      const mark = screen.getByRole('button', { name: 'MARK DESK-REVIEWED' });
      expect(mark.hasAttribute('disabled')).toBe(true);
      fireEvent.change(screen.getByLabelText(/^Reviewer/), { target: { value: ' Sam ' } });
      expect(mark.hasAttribute('disabled')).toBe(true); // not confirmed yet
      fireEvent.click(screen.getByLabelText(/I checked every turn/));
      expect(mark.hasAttribute('disabled')).toBe(false);
      fireEvent.click(mark);
      expect(await screen.findByText("'sample-loop': true, // desk-reviewed by Sam, 2026-11-05")).toBeTruthy();
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
        verification: { status: 'desk-reviewed', reviewer: 'Sam', date: '2026-11-05' },
      });
    });

    it('waits for other unsaved changes before a review', async () => {
      await open();
      fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Draft' } });
      expect(screen.getByText(/Save or undo your other changes first/)).toBeTruthy();
      expect((screen.getByLabelText('Desk-reviewed') as HTMLInputElement).disabled).toBe(true);
    });

    it('adds an advisory and saves it with the route', async () => {
      await open();
      fireEvent.click(screen.getByRole('button', { name: '+ ADD AN ADVISORY' }));
      expect(screen.getByText('advisory 1: text is missing.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'SAVE' }).hasAttribute('disabled')).toBe(true);
      fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Canal path closed for works' } });
      fireEvent.change(screen.getByLabelText('From km'), { target: { value: '2,5' } });
      fireEvent.change(screen.getByLabelText('To km'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));
      await screen.findByText(/Saved/);
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
        advisories: [{ text: 'Canal path closed for works', fromKm: 2.5, toKm: 3 }],
      });
    });
  });
});
