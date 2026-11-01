/**
 * Session clock: monotonic while the device is awake, and corrected for time
 * the device spent asleep.
 *
 * `performance.now()` is monotonic, so wall-clock changes (NTP, time zones,
 * manual edits) never disturb a running countdown. On iOS, macOS and Android
 * it can, however, stop advancing while the device is asleep. To recover we
 * compare it against `Date.now()` on every read: if the wall clock moved
 * further than the monotonic clock by more than `sleepThresholdMs`, the device
 * was suspended, and we add the missing time to an offset.
 *
 * Trade-off: a forward wall-clock jump larger than the threshold that happens
 * while the page is open would also be counted as elapsed time. That is rare
 * and far less harmful than freezing the session during sleep.
 */

export interface Clock {
  now(): number;
}

export function createSessionClock(
  monotonic: () => number = () => performance.now(),
  wall: () => number = () => Date.now(),
  sleepThresholdMs = 1000,
): Clock {
  let offset = 0;
  let lastMono = monotonic();
  let lastWall = wall();

  return {
    now() {
      const mono = monotonic();
      const w = wall();
      const missing = w - lastWall - (mono - lastMono);
      if (missing > sleepThresholdMs) offset += missing;
      lastMono = mono;
      lastWall = w;
      return mono + offset;
    },
  };
}
