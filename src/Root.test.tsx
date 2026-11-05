import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Root from './Root';
import { offsetPoint } from './nav/geo';
import { bearingAt, pointAt } from './nav/route';
import { sampleRoute } from './nav/testing/replay';
import { resetOfflineMapForTests } from './sixk/map/offlineMap';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} }),
}));

// MapLibre needs WebGL, which jsdom doesn't have: stub the map at its boundary.
vi.mock('./sixk/map/RouteMap', () => ({
  default: (props: { label: string; duck?: { lost: boolean; lat: number; lon: number } | null; covered?: unknown[] }) => (
    <div
      data-testid="route-map"
      aria-label={props.label}
      data-duck={props.duck ? (props.duck.lost ? 'lost' : 'shown') : 'none'}
      data-duck-at={props.duck ? `${props.duck.lat.toFixed(5)},${props.duck.lon.toFixed(5)}` : ''}
      data-covered={props.covered ? props.covered.length : 0}
    />
  ),
}));

const tap = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));

// ---------- Geolocation mock ----------

type Success = (pos: GeolocationPosition) => void;
let watcher: Success | null = null;

function installGeolocation() {
  watcher = null;
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: vi.fn((ok: Success) => {
        watcher = ok;
        return 1;
      }),
      clearWatch: vi.fn(() => {
        watcher = null;
      }),
    },
  });
}

/** Sends a GPS fix at `at` ms (the hook stamps fixes with Date.now()). */
function gps(lat: number, lon: number, at: number, accuracy = 8) {
  vi.setSystemTime(at);
  act(() => {
    watcher?.({
      coords: { latitude: lat, longitude: lon, accuracy } as GeolocationCoordinates,
      timestamp: at,
    } as GeolocationPosition);
  });
}

beforeEach(() => {
  resetOfflineMapForTests();
  installGeolocation();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('mode picker', () => {
  it('opens on "What are we doing today?" with Daily Dashboard first', () => {
    render(<Root />);
    expect(screen.getByRole('heading', { name: 'What are we doing today?' })).toBeTruthy();
    const order = [...document.querySelectorAll('.mode-card__name')].map((n) => n.textContent);
    expect(order).toEqual(['Daily Dashboard', 'ACR Run/Walk Timer', 'Route Library']);
    // The beta build (a "…-beta" repository) adds a BETA tag; the live build doesn't.
    expect(screen.getByRole('heading', { name: __BETA__ ? 'AnyoneCanPace BETA' : 'AnyoneCanPace' })).toBeTruthy();
    expect(screen.queryByText('BETA') !== null).toBe(__BETA__);
    expect(screen.getByRole('button', { name: /ACR Run\/Walk Timer/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Route Library/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Daily Dashboard/ })).toHaveProperty('disabled', false);
  });

  it('picking the timer opens the unchanged timer; reopening the app shows the picker again', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const { unmount } = render(<Root />);
    tap(/ACR Run\/Walk Timer/);
    expect(screen.getByRole('timer').textContent).toBe('01:30');
    tap('START PACING');
    act(() => vi.advanceTimersByTime(91_000));
    expect(document.querySelector('.phase-label')?.textContent).toBe('WALK');
    unmount();

    render(<Root />);
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByRole('heading', { name: 'What are we doing today?' })).toBeTruthy();
  });

  it('people who already used the timer also start on the picker, and keep their intervals', () => {
    localStorage.setItem('anyonecanpace:prefs:v1', JSON.stringify({ run: 120, walk: 45, sound: true, vibration: true }));
    render(<Root />);
    expect(screen.queryByRole('timer')).toBeNull();
    tap(/ACR Run\/Walk Timer/);
    expect(screen.getByRole('timer').textContent).toBe('02:00');
  });

  it('switching mode from the timer: one tap when ready, two taps mid-session', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    render(<Root />);
    tap(/ACR Run\/Walk Timer/);
    tap('START PACING');
    act(() => vi.advanceTimersByTime(5_000));
    tap('Settings');
    tap('SWITCH MODE');
    expect(screen.getByRole('timer')).toBeTruthy(); // first tap only arms it
    tap('TAP AGAIN: END SESSION & SWITCH');
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByRole('button', { name: /^Route Library/ })).toBeTruthy();
  });

  it('the switch arm expires, so a stray later tap does nothing', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    render(<Root />);
    tap(/ACR Run\/Walk Timer/);
    tap('START PACING');
    tap('Settings');
    tap('SWITCH MODE');
    act(() => vi.advanceTimersByTime(5_000));
    tap('SWITCH MODE');
    expect(screen.getByRole('timer')).toBeTruthy();
  });
});

describe('Route Library', () => {
  const openLibrary = async () => {
    render(<Root />);
    tap(/^Route Library/);
    return screen.findByRole('heading', { name: 'Route Library' });
  };

  it('says whether directions were checked, in the list and before starting', async () => {
    await openLibrary();
    expect(screen.getByRole('button', { name: /Sample Loop/ }).textContent).toContain('✓ Field-checked directions');
    expect(screen.getByRole('button', { name: /Canal Test/ }).textContent).toContain('✓ Field-checked directions');
    expect(screen.getByRole('button', { name: /Pi Day/ }).textContent).toContain('⚠ Unverified directions');
    tap(/Pi Day/);
    const note = await screen.findByRole('note', { name: 'Directions: Unverified' });
    expect(note.textContent).toMatch(/suggested automatically and haven’t been checked by a person or on the ground/);
    // It comes before the start button.
    const start = screen.getByRole('button', { name: 'START ROUTE' });
    expect(note.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lists routes with place, distance, time, terrain, tags and an outline', async () => {
    await openLibrary();
    expect(screen.getByText('Where are we running today?')).toBeTruthy();
    const card = screen.getByRole('button', { name: /Sample Loop/ });
    expect(card.textContent).toContain('Downtown → Old Port');
    expect(card.textContent).toContain('6.4 km loop');
    // 7:30 /km by default; screen readers hear "about", not "~".
    expect(card.textContent).toContain('~48 min');
    expect(card.getAttribute('aria-label') ?? card.textContent).toContain('about 48 minutes');
    expect(card.textContent).toContain('Some gentle hills');
    expect(card.textContent).toContain('Waterfront');
    expect(card.querySelector('svg path')?.getAttribute('d')).toMatch(/^M/);
    expect(screen.getByRole('button', { name: /Pi Day/ }).textContent).toContain('Shape run');
    // jsdom has no Cache Storage: the map status says so honestly, at the top.
    expect((await screen.findAllByText(/can’t save the map/)).length).toBeGreaterThan(0);
  });

  it('settings: the pace changes the times and is remembered; the filter lasts one visit', async () => {
    const first = render(<Root />);
    tap(/^Route Library/);
    await screen.findByRole('heading', { name: 'Route Library' });

    tap('Library settings');
    tap('6 minutes per km');
    expect(screen.getByRole('button', { name: /Sample Loop/ }).textContent).toContain('~38 min');
    tap('Faster: 15 seconds less per km');
    expect(screen.getByRole('button', { name: /Sample Loop/ }).textContent).toContain('~37 min');

    // Only filters that match a route are offered.
    for (const name of ['All', 'Shape runs', 'Under 5 km', 'Flat', 'Waterfront', '10 km+']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    tap('Flat');
    expect(screen.getByRole('button', { name: 'Flat' }).getAttribute('aria-pressed')).toBe('true');
    tap('DONE');
    expect(screen.queryByRole('button', { name: /Sample Loop/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Pi Day/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Showing flat routes/);
    tap('Show all');
    expect(screen.getByRole('button', { name: /Sample Loop/ })).toBeTruthy();

    // Filter again, then come back another day: every route shows, at the saved pace.
    tap('Library settings');
    tap('Shape runs');
    tap('DONE');
    expect(screen.queryByRole('button', { name: /Canal Test/ })).toBeNull();
    first.unmount();
    render(<Root />);
    tap(/^Route Library/);
    await screen.findByRole('heading', { name: 'Route Library' });
    expect(screen.getByRole('button', { name: /Canal Test/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sample Loop/ }).textContent).toContain('~37 min');
  });

  it('route page: stats, map, elevation, turns, empty advisories, start button', async () => {
    await openLibrary();
    tap(/Sample Loop/);
    expect(await screen.findByRole('button', { name: 'START ROUTE' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sample Loop', level: 1 })).toBeTruthy();
    expect(screen.getByText('Distance').nextSibling?.textContent).toBe('6.4 km');
    expect((await screen.findByTestId('route-map')).getAttribute('aria-label')).toBe('Map of Sample Loop');
    expect(screen.getByRole('img', { name: /Elevation from \d+ to \d+ metres/ })).toBeTruthy();
    const turns = screen.getByRole('heading', { name: 'Turns' }).nextElementSibling as HTMLElement;
    expect(turns.querySelectorAll('li').length).toBeGreaterThan(4);
    // The first entry is the start ("Start", or "Start on <street>" when the first leg has a known name).
    expect(turns.querySelector('li')?.textContent).toMatch(/Start/);
    expect(screen.getByText('No advisories for this route right now.')).toBeTruthy();
    expect(screen.getByText(/^Last checked /)).toBeTruthy();
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeTruthy();
    expect(screen.getByText(/On The Go Map/)).toBeTruthy();

    tap('‹ ROUTES');
    expect(screen.getByRole('button', { name: /Sample Loop/ })).toBeTruthy();
  });

  it('follow view: head to start, start, progress, turn cue, off route → going rogue, back, end needs two taps', async () => {
    const route = sampleRoute();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });

    await openLibrary();
    tap(/Sample Loop/);
    fireEvent.click(await screen.findByRole('button', { name: 'START ROUTE' }));
    expect(screen.getByText('Finding your location…')).toBeTruthy();

    // 600 m north of the start: head there, or start anyway.
    const far = offsetPoint(route.points[0], 0, 600);
    gps(far.lat, far.lon, 1_001_000);
    expect(screen.getByText('Head to the start: 600 m')).toBeTruthy();
    expect(screen.getByText(/to the south/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'START ANYWAY' })).toBeTruthy();

    // Before Start the duck is on the GPS dot and looks normal, even 600 m away.
    expect((await screen.findByTestId('route-map')).getAttribute('data-duck')).toBe('shown');

    // At the start.
    let t = 1_002_000;
    gps(route.points[0].lat, route.points[0].lon, t);
    expect(screen.getByText('You’re at the start')).toBeTruthy();
    tap('START ROUTE');
    const live = document.querySelector('[aria-live="assertive"]') as HTMLElement;
    expect(live.textContent).toContain('Route started.');
    expect(live.textContent).toMatch(/Route started\. .*Left on .* in \d+ metres\./); // first turn is under 150 m away
    await screen.findByTestId('route-map');
    expect(screen.getByText('0.0 km done · 6.4 km to go')).toBeTruthy();

    // Run to just before the second turn (well past 150 m).
    const turn = route.turns.find((x) => x.atM > 600)!;
    for (let d = 0; d <= turn.atM - 100; d += 3) {
      t += 1000;
      const p = pointAt(route, d);
      gps(p.lat, p.lon, t);
    }
    expect(document.querySelector('.banner__primary')?.textContent).toMatch(/ in 100 m$/);
    expect(live.textContent).toMatch(/in 150 metres\.$/);
    expect(vibrate).toHaveBeenCalled();
    expect(screen.getByText(/km done · .* km to go/).textContent).toContain(`${((turn.atM - 100) / 1000).toFixed(1)} km done`);
    expect(Number(screen.getByTestId('route-map').getAttribute('data-covered'))).toBeGreaterThan(1);

    // Walk 120 m off to the side and stay there for 6 s.
    const here = pointAt(route, turn.atM - 100);
    const away = offsetPoint(here, bearingAt(route, turn.atM - 100) + 90, 120);
    for (let i = 0; i < 7; i++) {
      t += 1000;
      gps(away.lat, away.lon, t);
    }
    expect(screen.getByText('Going rogue?')).toBeTruthy();
    expect(document.querySelector('.banner__primary')?.textContent).toMatch(/^Off route/);
    expect(screen.getByTestId('route-map').getAttribute('data-duck')).toBe('lost');
    // The duck is where you are, not left behind on the route.
    const duckAt = () => screen.getByTestId('route-map').getAttribute('data-duck-at');
    expect(duckAt()).toBe(`${away.lat.toFixed(5)},${away.lon.toFixed(5)}`);
    expect(screen.getByRole('button', { name: /^NO, GUIDE ME BACK/ })).toBeTruthy();
    tap(/^YES, ON PURPOSE/);
    expect(document.querySelector('.banner__primary')?.textContent).toBe('Going rogue');
    // Going rogue calms the banner, but the duck stays the confused one until back on the route,
    // and keeps following you.
    expect(screen.getByTestId('route-map').getAttribute('data-duck')).toBe('lost');
    const further = offsetPoint(away, 0, 50);
    t += 1000;
    gps(further.lat, further.lon, t);
    expect(duckAt()).toBe(`${further.lat.toFixed(5)},${further.lon.toFixed(5)}`);

    // Back on the route.
    t += 1000;
    gps(here.lat, here.lon, t);
    expect(live.textContent).toContain('Back on route');
    expect(screen.getByTestId('route-map').getAttribute('data-duck')).toBe('shown');

    // Ending needs the menu and two taps.
    tap('MENU');
    tap('END ROUTE');
    expect(screen.getByRole('button', { name: 'TAP AGAIN TO END ROUTE' })).toBeTruthy();
    tap('TAP AGAIN TO END ROUTE');
    expect(await screen.findByRole('button', { name: 'START ROUTE' })).toBeTruthy();
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('GPS too rough mid-route: a prominent warning, and the frozen directions are marked out of date', async () => {
    const route = sampleRoute();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    await openLibrary();
    tap(/Sample Loop/);
    fireEvent.click(await screen.findByRole('button', { name: 'START ROUTE' }));
    let t = 1_001_000;
    gps(route.points[0].lat, route.points[0].lon, t);
    tap('START ROUTE');
    for (let d = 0; d <= 200; d += 3) {
      t += 1000;
      const p = pointAt(route, d);
      gps(p.lat, p.lon, t);
    }
    expect(screen.queryByRole('alert')).toBeNull();
    // 12 s of fixes only good to ±150 m.
    for (let i = 0; i < 12; i++) {
      t += 1000;
      const p = pointAt(route, 200 + i * 3);
      gps(p.lat, p.lon, t, 150);
    }
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/GPS too rough\. Location is only accurate to about 150 m/);
    expect(screen.getByRole('region', { name: 'Directions (may be out of date)' })).toBeTruthy();
    // A good fix again: the warning goes away.
    t += 1000;
    const p = pointAt(route, 240);
    gps(p.lat, p.lon, t);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('region', { name: 'Directions' })).toBeTruthy();
  });

  it('starting away from the route: the duck looks confused until it joins the route', async () => {
    const route = sampleRoute();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    await openLibrary();
    tap(/Sample Loop/);
    fireEvent.click(await screen.findByRole('button', { name: 'START ROUTE' }));
    const far = offsetPoint(route.points[0], 0, 600);
    gps(far.lat, far.lon, 1_001_000);
    tap('START ANYWAY');
    expect(document.querySelector('.banner__primary')?.textContent).toMatch(/^Head to the route/);
    expect((await screen.findByTestId('route-map')).getAttribute('data-duck')).toBe('lost');
    // No "Going rogue?" for someone who hasn't joined yet.
    expect(document.querySelector('dialog[aria-labelledby="rogue-title"]')?.hasAttribute('open')).toBe(false);

    gps(route.points[0].lat, route.points[0].lon, 1_002_000);
    expect(screen.getByTestId('route-map').getAttribute('data-duck')).toBe('shown');
  });

  it('explains when location is blocked', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (_ok: Success, fail: (e: { code: number }) => void) => {
          fail({ code: 1 });
          return 1;
        },
        clearWatch: () => {},
      },
    });
    await openLibrary();
    tap(/Sample Loop/);
    fireEvent.click(await screen.findByRole('button', { name: 'START ROUTE' }));
    expect(screen.getByText('No GPS yet')).toBeTruthy();
    expect(screen.getByText(/Location is blocked/)).toBeTruthy();
  });

  it('MODES goes back to the picker', async () => {
    await openLibrary();
    tap('MODES');
    expect(screen.getByRole('button', { name: /ACR Run\/Walk Timer/ })).toBeTruthy();
  });
});
