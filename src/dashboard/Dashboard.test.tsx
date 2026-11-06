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

/** The chosen hour chip's accessible name, e.g. "Today 10 a.m.". */
function checkedRunTime() {
  const radio = screen.getAllByRole('radio').find((r) => (r as HTMLInputElement).checked) as HTMLInputElement;
  return radio.getAttribute('aria-label');
}

async function openDashboard() {
  render(<Root />);
  fireEvent.click(screen.getByRole('button', { name: /Stooopid Sunday Dashboard/ }));
  const heading = await screen.findByRole('heading', { name: 'Stooopid Sunday Dashboard' });
  // The lazy mode sits inside a retry boundary: let its first effects (the forecast check) settle.
  await act(async () => {});
  return heading;
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

describe('Stooopid Sunday Dashboard', () => {
  it('is the first choice in the mode picker', () => {
    render(<Root />);
    expect(document.querySelector('.mode-card__name')?.textContent).toBe('Stooopid Sunday Dashboard');
  });

  it('fetches once for Montréal, then shows the weather and outfit as text', async () => {
    await openDashboard();
    expect(await screen.findByText(/^Updated /)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('api.open-meteo.com/v1/gem');
    expect(url).toContain('latitude=45.5017');

    // Default run time: the next 10 a.m., picked in the hour strip.
    expect(screen.getByRole('radiogroup', { name: 'Run starts' })).toBeTruthy();
    expect(checkedRunTime()).toBe('Today 10 a.m.');
    // The forecast doesn't reach Sunday yet, so "Running another time?" starts open.
    expect(screen.getByRole('button', { name: /^Running another time\?/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Sunday run' }).textContent).toContain('Sunday’s outfit shows up Wednesday.');
    const wear = screen.getByRole('region', { name: 'What to wear then' });
    expect(wear.querySelector('.wear__headline')?.textContent).toMatch(/\.$/);
    // Air temperature first (it decides the clothes), then feels-like, sky, rain and wind on one line.
    expect(wear.querySelector('.wear__weather')?.textContent).toMatch(/^Air -?\d+\u00a0°C · feels -?\d+\u00a0°C.+ · \d+\u00a0% (rain|rain or snow) · wind \d+\u00a0km\/h$/);
    const details = document.querySelector('details.dash-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('Weather details');
    expect(details.textContent).toMatch(/Wind \d+ km\/h, gusts \d+ km\/h/);
    expect(details.textContent).toMatch(/Clothes follow the air temperature/);
    // No run-feel arithmetic any more.
    expect(wear.textContent).not.toMatch(/Dress for/);
    // The dressed duck is decorative; the list carries the meaning.
    const duck = wear.querySelector('.dressed-duck') as HTMLElement;
    expect(duck.getAttribute('aria-hidden')).toBe('true');
    expect(duck.querySelectorAll('img[data-piece]').length).toBeGreaterThan(0);
    // No advisories: one line, not a card, still saying when they were checked.
    expect(screen.queryByRole('region', { name: 'Route advisories' })).toBeNull();
    expect(screen.getByText(/^No route advisories\./).textContent).toMatch(/Last checked/);
    expect(screen.getByText(/Weather data by/).textContent).toMatch(/Open-Meteo.*Environment and Climate Change Canada/);
    // A fresh forecast's status sits below the outfit.
    const order = (a: Element, b: Element) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order(wear, screen.getByText(/^Updated /))).toBeTruthy();
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
    expect(screen.getByRole('region', { name: 'What to wear then' })).toBeTruthy();
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
    // A problem with the forecast is shown above the outfit, not tucked below it.
    const status = screen.getByText(/Couldn’t update/);
    const wear = screen.getByRole('region', { name: 'What to wear then' });
    expect(status.compareDocumentPosition(wear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the hour strip offers 6 a.m. to 9 p.m. for a few days, each named with its day', async () => {
    await openDashboard();
    await screen.findByText(/^Updated /);
    const names = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
    expect(names[0]).toBe('Today 9 a.m.'); // the hour under way (it's 9:12)
    expect(names).toContain('Tomorrow 6 a.m.');
    expect(names).toContain('Tomorrow 9 p.m.');
    expect(names).not.toContain('Tomorrow 5 a.m.');
    expect(names).not.toContain('Tomorrow 10 p.m.');
    expect(new Set(names.map((n) => n?.replace(/ \d.*$/, ''))).size).toBeLessThanOrEqual(3);
  });

  it('a saved forecast that no longer covers the coming hours says to check outside', async () => {
    localStorage.setItem('anyonecanpace:weather:v1', JSON.stringify(parseGem(fixture, est(4, 9))));
    vi.setSystemTime(est(8, 9));
    setOnline(false);
    await openDashboard();
    expect(screen.getByText('Check outside')).toBeTruthy();
    expect(screen.getByText(/doesn’t cover the coming hours/)).toBeTruthy();
  });

  it('after 10 a.m. the default is tomorrow 10 a.m.', async () => {
    vi.setSystemTime(est(4, 13));
    await openDashboard();
    await screen.findByText(/^Updated /);
    expect(checkedRunTime()).toBe('Tomorrow 10 a.m.');
  });

  it('choosing another run time updates the outfit', async () => {
    await openDashboard();
    await screen.findByText(/^Updated /);
    fireEvent.click(screen.getByRole('radio', { name: 'Today 7 p.m.' }));
    expect(checkedRunTime()).toBe('Today 7 p.m.');
    const wear = screen.getByRole('region', { name: 'What to wear then' });
    // The headline names the layers; the rest of the list follows in words.
    expect(wear.querySelector('.wear__also')?.textContent).toMatch(/^Also: .*reflective vest/);
    expect(wear.textContent).toContain('Dark at run time');
    // No "usual start" button any more: the default is always the next 10 a.m.
    expect(screen.queryByRole('button', { name: /USUAL START/ })).toBeNull();
  });

  it('Sunday run: when and where; the story section copies the map link for a Link sticker', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openDashboard();
    const run = screen.getByRole('region', { name: 'Sunday run' });
    expect(run.textContent).toContain('Sunday, November 8 · start 10:15 a.m.');
    expect(run.textContent).toContain('Meet 10:00 a.m. at Café Tranquille: at the café entrance, 1442 Rue Clark');
    const link = 'https://www.google.com/maps/search/?api=1&query=45.50935,-73.56488';
    expect(screen.getByRole('link', { name: 'OPEN MAP' }).getAttribute('href')).toBe(link);

    // MAKE STORY and the map link sit in their own section, after "Running another time?".
    const story = screen.getByRole('region', { name: 'Post the Sunday story' });
    const another = screen.getByRole('region', { name: /^Running another time\?/ });
    expect(another.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(story.textContent).toContain('The story works from Wednesday.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'COPY MAP LINK' })));
    expect(writeText).toHaveBeenCalledWith(link);
    expect(story.textContent).toContain('Map link copied.');

    // No clipboard (or it refuses): show the link to copy by hand.
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'COPY MAP LINK' })));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(link);
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('once the forecast reaches Sunday: Sunday’s outfit first, another time folded to one line', async () => {
    // The recording moved 3 days later: Saturday morning, reaching Sunday.
    const DAYS = 3 * 86_400;
    const f = structuredClone(fixture) as typeof fixture;
    f.hourly.time = f.hourly.time.map((t) => t + DAYS);
    f.daily.time = f.daily.time.map((t) => t + DAYS);
    f.daily.sunrise = f.daily.sunrise.map((t) => t + DAYS);
    f.daily.sunset = f.daily.sunset.map((t) => t + DAYS);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(f), { headers: { 'Content-Type': 'application/json' } }));
    vi.setSystemTime(est(7, 8));
    await openDashboard();
    await screen.findByText(/^Updated /);

    const run = screen.getByRole('region', { name: 'Sunday run' });
    const sunday = screen.getByRole('region', { name: 'What to wear on Sunday' });
    expect(run.contains(sunday)).toBe(true);
    expect(sunday.querySelector('.wear__headline')?.textContent).toMatch(/\.$/);
    expect(screen.queryByRole('region', { name: 'Post the Sunday story' })?.textContent).not.toContain('works from');

    // Closed: one line with the time, air temperature and outfit; no picker yet.
    const toggle = screen.getByRole('button', { name: /^Running another time\?/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toMatch(/^Running another time\?\+Today 10 a\.m\. · -?\d+\u00a0°C · .+\.$/);
    expect(screen.queryByRole('radiogroup')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // The default skips Sunday (it has its own card): today 10 a.m., not tomorrow's.
    expect(checkedRunTime()).toBe('Today 10 a.m.');
    expect(screen.getByRole('region', { name: 'What to wear then' })).toBeTruthy();
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
