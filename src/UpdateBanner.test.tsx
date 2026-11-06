import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Root from './Root';
import { setSessionBusy } from './lib/swUpdate';

/** One service worker registration for the whole app, with a new version waiting. */
const register = vi.fn();
const updateServiceWorker = vi.fn(async () => {});
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: unknown) => {
    register(options);
    return { needRefresh: [true, () => {}], offlineReady: [false, () => {}], updateServiceWorker };
  },
}));

// MapLibre needs WebGL, which jsdom doesn't have.
vi.mock('./sixk/map/RouteMap', () => ({ default: () => <div data-testid="route-map" /> }));

const tap = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));
const banner = () => screen.queryByText('A new version of the app is ready.');

beforeEach(() => {
  localStorage.clear();
  register.mockClear();
  updateServiceWorker.mockClear();
  // The dashboard asks for the forecast; no network here.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 503 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionBusy('timer', false);
  setSessionBusy('route', false);
});

describe('new version banner', () => {
  it('shows on the home screen, and UPDATE switches to the new version', () => {
    render(<Root />);
    expect(banner()).toBeTruthy();
    tap('UPDATE');
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('shows the same in every mode, from one registration', async () => {
    render(<Root />);
    const registrations = register.mock.calls.length;
    tap(/^Stooopid Sunday Dashboard/);
    await screen.findByRole('heading', { name: 'Stooopid Sunday Dashboard' });
    await act(async () => {});
    expect(banner()).toBeTruthy();

    tap('HOME');
    tap(/^Route Library/);
    await screen.findByRole('heading', { name: 'Route Library' });
    expect(banner()).toBeTruthy();

    tap('HOME');
    tap(/^ACR Run\/Walk Timer/);
    expect(banner()).toBeTruthy();

    // No mode registers on its own: they all read Root's one registration.
    expect(register.mock.calls.length).toBe(registrations);
  });

  it('hides while a timer session or a route is live, and comes back after', () => {
    render(<Root />);
    tap(/^ACR Run\/Walk Timer/);
    tap('START PACING');
    // Updating reloads the page: never offered mid-session.
    expect(banner()).toBeNull();

    act(() => setSessionBusy('timer', false));
    expect(banner()).toBeTruthy();
    act(() => setSessionBusy('route', true));
    expect(banner()).toBeNull();
  });
});
