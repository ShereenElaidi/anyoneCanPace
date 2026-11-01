import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { loadPrefs } from './lib/prefs';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} }),
}));

const timer = () => screen.getByRole('timer');
const phase = () => document.querySelector('.phase-label')?.textContent;
const tap = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AnyoneCanPace app', () => {
  it('shows the ready screen with default intervals', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'AnyoneCanPace' })).toBeTruthy();
    expect(phase()).toBe('RUN');
    expect(timer().textContent).toBe('01:30');
    expect(screen.getByText('READY')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'START PACING' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /SKIP/ })).toBeNull();
  });

  it('counts down, alternates RUN/WALK, pauses, resumes and skips', () => {
    render(<App />);
    tap('START PACING');
    expect(screen.getByText('ACTIVE')).toBeTruthy();
    advance(10_000);
    expect(timer().textContent).toBe('01:20');

    advance(80_000);
    expect(phase()).toBe('WALK');
    expect(timer().textContent).toBe('01:00');
    expect(screen.getByText(/NEXT:/).textContent).toBe('NEXT: RUN');

    advance(60_000);
    expect(phase()).toBe('RUN');

    advance(5_000);
    tap('PAUSE');
    expect(screen.getByText('PAUSED')).toBeTruthy();
    advance(60_000);
    expect(timer().textContent).toBe('01:25');
    tap('RESUME');
    advance(5_000);
    expect(timer().textContent).toBe('01:20');

    tap(/SKIP/);
    expect(phase()).toBe('WALK');
    expect(timer().textContent).toBe('01:00');
  });

  it('editing durations mid-session never interrupts the countdown', () => {
    render(<App />);
    tap('START PACING');
    advance(30_000);
    tap('EDIT INTERVALS');
    tap('Run 15 seconds shorter');
    tap('Run 15 seconds shorter');
    tap('Walk 15 seconds longer');
    expect(timer().textContent).toBe('01:00'); // current RUN unchanged
    advance(10_000);
    expect(timer().textContent).toBe('00:50'); // still counting with the panel open
    tap('DONE');
    expect(screen.queryByRole('region', { name: 'Edit intervals' })).toBeNull();

    advance(50_000);
    expect(phase()).toBe('WALK');
    expect(timer().textContent).toBe('01:15'); // new WALK
    advance(75_000);
    expect(phase()).toBe('RUN');
    expect(timer().textContent).toBe('01:00'); // new RUN

    expect(loadPrefs()).toMatchObject({ run: 60, walk: 75 });
  });

  it('enforces the 15 s minimum', () => {
    render(<App />);
    tap('EDIT INTERVALS');
    for (let i = 0; i < 10; i++) {
      const shorter = screen.getByRole('button', { name: 'Walk 15 seconds shorter' }) as HTMLButtonElement;
      if (!shorter.disabled) fireEvent.click(shorter);
    }
    expect(screen.getByRole('button', { name: 'Walk 15 seconds shorter' })).toHaveProperty('disabled', true);
    expect(loadPrefs().walk).toBe(15);
  });

  it('restores saved preferences on reload', () => {
    localStorage.setItem('anyonecanpace:prefs:v1', JSON.stringify({ run: 120, walk: 45, sound: false, vibration: true }));
    render(<App />);
    expect(timer().textContent).toBe('02:00');
  });

  it('resets only after a second confirming tap, keeping preferences', () => {
    localStorage.setItem('anyonecanpace:prefs:v1', JSON.stringify({ run: 120, walk: 45, sound: true, vibration: true }));
    render(<App />);
    tap('START PACING');
    advance(130_000);
    expect(phase()).toBe('WALK');

    tap('Settings');
    tap('END & RESET SESSION');
    expect(phase()).toBe('WALK'); // first tap only arms it
    tap('TAP AGAIN TO END SESSION');
    expect(phase()).toBe('RUN');
    expect(timer().textContent).toBe('02:00');
    expect(screen.getByText('READY')).toBeTruthy();
    advance(5_000);
    expect(timer().textContent).toBe('02:00');
  });

  it('toggles sound and keeps working when audio and wake lock are unavailable', () => {
    render(<App />);
    tap('Settings');
    const sound = screen.getByRole('switch', { name: 'Sound cues' });
    expect(sound.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sound);
    expect(sound.getAttribute('aria-checked')).toBe('false');
    expect(loadPrefs().sound).toBe(false);

    // jsdom has neither AudioContext nor navigator.wakeLock.
    tap('CLOSE');
    tap('START PACING');
    advance(91_000);
    expect(phase()).toBe('WALK');
  });

  it('survives a failing wake lock request', async () => {
    const request = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    try {
      render(<App />);
      tap('START PACING');
      await act(async () => {
        await Promise.resolve();
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Screen may lock/)).toBeTruthy();
      advance(90_000);
      expect(phase()).toBe('WALK');
      expect(request).toHaveBeenCalledTimes(1); // no retry loop
    } finally {
      Reflect.deleteProperty(navigator, 'wakeLock');
    }
  });

  it('announces phase changes, not every second', () => {
    render(<App />);
    const live = document.querySelector('[aria-live="assertive"]') as HTMLElement;
    tap('START PACING');
    expect(live.textContent).toContain('Session started');
    advance(30_000);
    expect(live.textContent).toContain('Session started');
    advance(60_000);
    expect(live.textContent).toContain('WALK now');
  });

  it('moves the decorative duck along the ring with the remaining time', () => {
    render(<App />);
    const orbit = () => document.querySelector('.duck-orbit') as HTMLElement;
    const duck = () => document.querySelector('.duck-orbit__duck') as HTMLElement;
    expect(orbit().getAttribute('aria-hidden')).toBe('true');
    expect(duck().getAttribute('alt')).toBe('');
    expect(orbit().style.transform).toBe('rotate(360deg)');

    tap('START PACING');
    advance(45_000); // half of the 90 s run is left, so the duck is at 6 o'clock
    expect(orbit().style.transform).toBe('rotate(180deg)');
    expect(duck().style.transform).toContain('rotate(-180deg)');
    expect(duck().style.transform).toContain('scaleX(1)');

    advance(30_000); // 15 s left: past 3 o'clock, on the upper half, so the duck turns to face left
    expect(orbit().style.transform).toBe('rotate(60deg)');
    expect(duck().style.transform).toContain('scaleX(-1)');
  });
});
