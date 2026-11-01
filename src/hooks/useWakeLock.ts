import { useEffect, useState } from 'react';

export type WakeLockStatus = 'off' | 'on' | 'unsupported' | 'failed';

/**
 * Keeps the screen awake while `wanted` is true and the page is visible.
 *
 * Browsers drop the lock whenever the page is hidden, so it is requested again
 * (once) each time the page becomes visible. Only one request is in flight at
 * a time. Failure is reported, never thrown: the timer works without it.
 */
export function useWakeLock(wanted: boolean): WakeLockStatus {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [status, setStatus] = useState<WakeLockStatus>(supported ? 'off' : 'unsupported');

  useEffect(() => {
    if (!supported || !wanted) {
      setStatus(supported ? 'off' : 'unsupported');
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let disposed = false;

    const acquire = async () => {
      if (pending || sentinel || disposed || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (disposed) {
          void lock.release();
          return;
        }
        sentinel = lock;
        setStatus('on');
        lock.addEventListener('release', () => {
          sentinel = null;
          if (!disposed) setStatus('off');
        });
      } catch {
        if (!disposed) setStatus('failed');
      } finally {
        pending = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) void sentinel.release().catch(() => {});
      sentinel = null;
    };
  }, [supported, wanted]);

  return status;
}
