import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadIfIdle, sessionBusy, setSessionBusy, SW_OPTIONS } from './swUpdate';

afterEach(() => {
  setSessionBusy('timer', false);
  setSessionBusy('route', false);
});

describe('service worker activation never reloads a live session', () => {
  it('reloads when nothing is running', () => {
    const reload = vi.fn();
    expect(reloadIfIdle(reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload while a timer session is running or paused, or a route is being followed', () => {
    const reload = vi.fn();
    setSessionBusy('timer', true);
    expect(reloadIfIdle(reload)).toBe(false);
    setSessionBusy('timer', false);
    setSessionBusy('route', true);
    expect(reloadIfIdle(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    setSessionBusy('route', false);
    expect(sessionBusy()).toBe(false);
  });

  it('the options passed to useRegisterSW handle the reload themselves', () => {
    expect(typeof SW_OPTIONS.onNeedReload).toBe('function');
    setSessionBusy('timer', true);
    // Busy: calling it must not throw or navigate (jsdom would log a navigation error).
    expect(() => SW_OPTIONS.onNeedReload()).not.toThrow();
  });
});
