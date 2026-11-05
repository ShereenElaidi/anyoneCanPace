import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Root from '../Root';
import fixture from '../weather/fixtures/gem-2026-11-04.json';
import { parseGem } from '../weather/forecast';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} }),
}));

/** Montréal local time on 2026-11-04 (EST, UTC−5). */
const est = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour + 5, min);
const ok = () => new Response(JSON.stringify(fixture), { headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

async function openDashboard() {
  localStorage.setItem('anyonecanpace:mode:v1', 'dashboard');
  render(<Root />);
  return screen.findByRole('heading', { name: 'Daily Dashboard' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(est(4, 9, 12));
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal('fetch', fetchMock);
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('Daily Dashboard', () => {
  it('is in the mode picker', () => {
    render(<Root />);
    fireEvent.click(screen.getByRole('button', { name: /Daily Dashboard/ }));
    expect(localStorage.getItem('anyonecanpace:mode:v1')).toBe('dashboard');
  });

  it('fetches once for Montréal, then shows the weather and outfit as text', async () => {
    await openDashboard();
    expect(await screen.findByText(/^Updated /)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('api.open-meteo.com/v1/gem');
    expect(url).toContain('latitude=45.5017');

    // Default run time: the next whole hour.
    expect((screen.getByLabelText('Run starts') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Today 10 a.m.');
    expect(screen.getByText(/^Feels like/)).toBeTruthy();
    const wear = screen.getByRole('region', { name: 'What to wear' });
    expect(wear.querySelector('.wear__headline')?.textContent).toMatch(/\.$/);
    expect(wear.querySelectorAll('.wear__items li').length).toBeGreaterThan(1);
    expect(wear.textContent).toContain('Bring an extra layer for the wait at the start.');
    // The duck is decorative; the list carries the meaning.
    expect(wear.querySelector('.duck-slot')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText(/Weather data by/).textContent).toMatch(/Open-Meteo.*Environment and Climate Change Canada/);
    // Saved for offline use.
    expect(localStorage.getItem('anyonecanpace:weather:v1')).toContain('"hours"');
  });

  it('a fresh saved forecast is used without a new request', async () => {
    localStorage.setItem('anyonecanpace:weather:v1', JSON.stringify(parseGem(fixture, est(4, 9))));
    await openDashboard();
    expect(screen.getByText('Updated 9:00 a.m.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offline: falls back to the last known forecast and says when it is from', async () => {
    localStorage.setItem('anyonecanpace:weather:v1', JSON.stringify(parseGem(fixture, est(4, 6, 30))));
    setOnline(false);
    await openDashboard();
    expect(screen.getByText(/Offline: showing the forecast from 6:30 a\.m\./)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'What to wear' })).toBeTruthy();
  });

  it('offline with nothing saved: "Check outside"', async () => {
    setOnline(false);
    await openDashboard();
    expect(screen.getByText('Check outside')).toBeTruthy();
    expect(screen.getByText(/you’re offline/)).toBeTruthy();
  });

  it('a failed request keeps the old forecast and says so', async () => {
    localStorage.setItem('anyonecanpace:weather:v1', JSON.stringify(parseGem(fixture, est(3, 18))));
    fetchMock.mockImplementation(async () => new Response('busy', { status: 503 }));
    await openDashboard();
    expect(await screen.findByText(/Couldn’t update: showing the forecast from yesterday 6:00 p\.m\./)).toBeTruthy();
    expect(screen.getByText(/It may be out of date/)).toBeTruthy();
  });

  it('a saved forecast that no longer covers the coming hours says to check outside', async () => {
    localStorage.setItem('anyonecanpace:weather:v1', JSON.stringify(parseGem(fixture, est(4, 9))));
    vi.setSystemTime(est(8, 9));
    setOnline(false);
    await openDashboard();
    expect(screen.getByText('Check outside')).toBeTruthy();
    expect(screen.getByText(/doesn’t cover the coming hours/)).toBeTruthy();
  });

  it('choosing another run time updates the outfit; the usual start hour is remembered', async () => {
    await openDashboard();
    await screen.findByText(/^Updated /);
    const select = screen.getByLabelText('Run starts') as HTMLSelectElement;
    const evening = [...select.options].find((o) => o.textContent === 'Today 7 p.m.')!;
    fireEvent.change(select, { target: { value: evening.value } });
    const wear = screen.getByRole('region', { name: 'What to wear' });
    expect(wear.textContent).toContain('Reflective vest');
    expect(wear.textContent).toContain('Dark at run time');

    fireEvent.click(screen.getByRole('button', { name: 'MAKE 7 p.m. MY USUAL START' }));
    expect(localStorage.getItem('anyonecanpace:runhour:v1')).toBe('19');
    expect(screen.getByRole('button', { name: /7 p\.m\. IS MY USUAL START/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('refresh asks again, once at a time', async () => {
    await openDashboard();
    await screen.findByText(/^Updated /);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'REFRESH' }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
