import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Root from '../Root';
import fixture from '../weather/fixtures/gem-2026-11-04.json';
import type { StorySnapshot } from './snapshot';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} }),
}));

// jsdom has no canvas: stand in for the drawing (two pages), and record what it was asked to draw.
const drawn: StorySnapshot[] = [];
let blobs = 0;
vi.mock('./render', () => ({
  renderStory: vi.fn(async (s: StorySnapshot) => {
    drawn.push(s);
    return [1, 2].map((p) => new Blob([`story ${drawn.length} page ${p}`], { type: 'image/png' }));
  }),
}));

const est = (d: number, h: number, min = 0) => Date.UTC(2026, 10, d, h + 5, min);
const DAYS = 4 * 86_400;

/** The recorded forecast moved 4 days later (it then covers Saturday and Sunday Nov 7–8). */
function shifted(tempShift = 0) {
  const f = structuredClone(fixture) as typeof fixture;
  f.hourly.time = f.hourly.time.map((t) => t + DAYS);
  f.hourly.temperature_2m = f.hourly.temperature_2m.map((t) => t + tempShift);
  f.daily.time = f.daily.time.map((t) => t + DAYS);
  f.daily.sunrise = f.daily.sunrise.map((t) => t + DAYS);
  f.daily.sunset = f.daily.sunset.map((t) => t + DAYS);
  return f;
}
const respond = (json: unknown) => new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

async function openDashboard() {
  render(<Root />);
  fireEvent.click(screen.getByRole('button', { name: /Stooopid Sunday Dashboard/ }));
  await screen.findByRole('heading', { name: 'Stooopid Sunday Dashboard' });
  await act(async () => {});
  await screen.findByText(/^Updated /);
}

beforeEach(() => {
  drawn.length = 0;
  blobs = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  URL.createObjectURL = vi.fn(() => `blob:story-${drawn.length}-${(blobs++ % 2) + 1}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'onLine');
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

describe('Sunday story', () => {
  it('too early in the week: says when the forecast will reach Sunday', async () => {
    vi.setSystemTime(est(4, 9, 12));
    fetchMock = vi.fn(async () => respond(fixture));
    vi.stubGlobal('fetch', fetchMock);
    await openDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'MAKE STORY' }));
    expect(screen.getByRole('region', { name: 'Post the Sunday story' }).textContent).toContain(
      'The forecast doesn’t reach Sunday, November 8 yet. It covers 5 days: try from Wednesday.',
    );
    expect(drawn).toHaveLength(0);
  });

  it('Saturday night: preview, share and save one frozen picture; a refresh doesn’t change it', async () => {
    vi.setSystemTime(est(7, 21));
    fetchMock = vi.fn(async () => respond(shifted()));
    vi.stubGlobal('fetch', fetchMock);
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    await openDashboard();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'MAKE STORY' })));
    const dialog = await screen.findByRole('dialog', { name: 'Sunday story' });
    const img = (await screen.findByRole('img', { name: /^Story page 1: See you Sunday/ })) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('blob:story-1-1');
    const map = screen.getByRole('img', { name: /^Story page 2: Lost\? Find your Flock! Map to Café Tranquille/ });
    expect(map.getAttribute('src')).toBe('blob:story-1-2');
    expect(drawn).toHaveLength(1);
    expect(drawn[0].run.date).toBe('2026-11-08');
    expect(drawn[0].weather.hourAt).toBe(est(8, 10));
    expect(dialog.textContent).toMatch(/Forecast from Saturday/);
    expect(dialog.textContent).not.toMatch(/Early forecast/); // Saturday night: the day before

    // The same pictures go out, named for the day and in posting order.
    const save1 = screen.getByRole('link', { name: 'SAVE PAGE 1' });
    expect(save1.getAttribute('href')).toBe('blob:story-1-1');
    expect(save1.getAttribute('download')).toBe('anyonecanpace-sunday-2026-11-08-1.png');
    expect(screen.getByRole('link', { name: 'SAVE PAGE 2' }).getAttribute('download')).toBe('anyonecanpace-sunday-2026-11-08-2-map.png');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'SHARE' })));
    const sent = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files;
    expect(sent.map((f) => f.name)).toEqual(['anyonecanpace-sunday-2026-11-08-1.png', 'anyonecanpace-sunday-2026-11-08-2-map.png']);
    expect(await sent[0].text()).toBe('story 1 page 1');
    expect(await sent[1].text()).toBe('story 1 page 2');

    // A background refresh with a colder forecast: the open story stays as it was.
    fetchMock.mockImplementation(async () => respond(shifted(-10)));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'REFRESH' })));
    expect(drawn).toHaveLength(1);
    expect(img.getAttribute('src')).toBe('blob:story-1-1');

    // REMAKE takes the new forecast.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'REMAKE' })));
    expect(drawn).toHaveLength(2);
    expect(drawn[1].weather.tempC).toBe(drawn[0].weather.tempC - 10);
  });

  it('Wednesday: the story can be made, labelled as an early forecast', async () => {
    vi.setSystemTime(est(4, 9, 12));
    // Fetched on Wednesday Nov 4, reaching Sunday Nov 8 and beyond: the recording (Nov 4–5)
    // repeated 2 and 4 days later, like a 5-day forecast.
    const f = structuredClone(fixture) as typeof fixture;
    const two = 2 * 86_400;
    for (const k of Object.keys(f.hourly) as (keyof typeof f.hourly)[]) {
      const col = fixture.hourly[k] as number[];
      (f.hourly[k] as number[]) = k === 'time' ? [...col, ...col.map((t) => t + two), ...col.map((t) => t + 2 * two)] : [...col, ...col, ...col];
    }
    vi.stubGlobal('fetch', vi.fn(async () => respond(f)));
    await openDashboard();
    // The hour picker (under "Running another time?") still shows only 3 days.
    fireEvent.click(screen.getByRole('button', { name: /^Running another time\?/ }));
    expect(screen.getAllByText(/^(Today|Tomorrow|Friday|Saturday|Sunday)$/).map((e) => e.textContent)).toEqual([
      'Today',
      'Tomorrow',
      'Friday',
    ]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'MAKE STORY' })));
    const dialog = await screen.findByRole('dialog', { name: 'Sunday story' });
    expect(drawn[0].run.date).toBe('2026-11-08');
    expect(dialog.textContent).toContain('Early forecast: it can still change. Check again on Saturday and REMAKE if it did.');
  });

  it('no file sharing (desktop browsers): SAVE IMAGE and press-and-hold only', async () => {
    vi.setSystemTime(est(7, 21));
    vi.stubGlobal('fetch', vi.fn(async () => respond(shifted())));
    await openDashboard();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'MAKE STORY' })));
    await screen.findByRole('img', { name: /^Story page 1:/ });
    expect(screen.queryByRole('button', { name: 'SHARE' })).toBeNull();
    expect(screen.getByRole('link', { name: 'SAVE PAGE 1' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'SAVE PAGE 2' })).toBeTruthy();
    expect(screen.getByText(/press and hold a picture/)).toBeTruthy();
  });
});
