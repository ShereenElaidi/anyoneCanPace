import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Root from '../Root';
import fixture from '../weather/fixtures/gem-2026-11-04.json';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} }),
}));

// One advisory written only in a route's own file (src/data/routes/pi-day.json), not in advisories.json.
vi.mock('../advisories/routeAdvisories', () => ({
  ROUTE_NOTICES: [
    { id: 'pi-day-0', route: 'pi-day', kind: 'manual', text: 'Bridge on Rue Wellington closed.', start: '2026-11-01', end: '2026-11-10' },
  ],
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 10, 4, 14, 12));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dashboard advisories', () => {
  it('shows a route’s own advisory with its route name, and never says there are none', async () => {
    render(<Root />);
    fireEvent.click(screen.getByRole('button', { name: /Stooopid Sunday Dashboard/ }));
    await screen.findByRole('heading', { name: 'Stooopid Sunday Dashboard' });
    await act(async () => {});
    const card = screen.getByRole('region', { name: 'Route advisories' });
    expect(card.textContent).toContain('Bridge on Rue Wellington closed.');
    expect(card.textContent).toContain('Pi Day');
    expect(card.textContent).toMatch(/Nov 1 – Nov 10/);
    expect(screen.queryByText(/No route advisories/)).toBeNull();
  });
});
