import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Root from '../Root';
import { pointAt } from '../nav/route';
import { sampleRoute } from '../nav/testing/replay';
import { resetOfflineMapForTests } from './map/offlineMap';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} }),
}));

// The map module loads but blows up while rendering (e.g. a broken MapLibre build).
vi.mock('./map/RouteMap', () => ({
  default: () => {
    throw new Error('map exploded');
  },
}));

type Success = (pos: GeolocationPosition) => void;
let watcher: Success | null = null;

beforeEach(() => {
  resetOfflineMapForTests();
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition: (ok: Success) => ((watcher = ok), 1), clearWatch: () => (watcher = null) },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'geolocation');
});

function gps(lat: number, lon: number, at: number) {
  vi.setSystemTime(at);
  act(() => watcher?.({ coords: { latitude: lat, longitude: lon, accuracy: 8 } as GeolocationCoordinates, timestamp: at } as GeolocationPosition));
}

describe('when the map fails', () => {
  it('the route page and the follow view keep working without it, with a way to try the map again', async () => {
    const route = sampleRoute();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    render(<Root />);
    fireEvent.click(screen.getByRole('button', { name: /Route Library/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Sample Loop/ }));
    expect(await screen.findByText('The map didn’t load. You can still start the route.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'TRY MAP AGAIN' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'START ROUTE' }));
    expect(await screen.findByText('The map didn’t load. Directions and distances still work.')).toBeTruthy();
    gps(route.points[0].lat, route.points[0].lon, 1_001_000);
    fireEvent.click(screen.getByRole('button', { name: 'START ROUTE' }));
    for (let d = 3, t = 1_002_000; d <= 120; d += 3, t += 1000) {
      const p = pointAt(route, d);
      gps(p.lat, p.lon, t);
    }
    expect(screen.getByRole('region', { name: 'Directions' }).textContent).toMatch(/now|in \d+ m|Continue/);
    expect(screen.getByText(/km done · .* km to go/)).toBeTruthy();
  });
});
