/**
 * Sun position and an estimated UV index. Pure maths, no clocks.
 *
 * GEM (the Environment Canada model) has no UV index, so UV is estimated
 * from how high the sun is and how cloudy it is. It is a rough guide for
 * "bring sunglasses / sunscreen", not a measurement, and the app says so.
 */

const RAD = Math.PI / 180;

/** Solar elevation above the horizon in degrees (low-precision NOAA-style formula, ±1°). */
export function solarElevationDeg(atMs: number, lat: number, lon: number): number {
  const d = atMs / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  const gmstHours = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const hourAngle = (gmstHours * 15 + lon) * RAD - ra;
  const φ = lat * RAD;
  return Math.asin(Math.sin(φ) * Math.sin(decl) + Math.cos(φ) * Math.cos(decl) * Math.cos(hourAngle)) / RAD;
}

/** Clear-sky UV index with the sun overhead; tuned so a Montréal June noon gives about 9. */
export const UV_CLEAR_SKY_K = 11;

/**
 * Estimated UV index: clear-sky UV ≈ K · sin(elevation)^2.42, reduced by
 * cloud (a heavy overcast cuts it by about three quarters).
 */
export function estimateUvIndex(elevationDeg: number, cloudPct: number): number {
  if (elevationDeg <= 0) return 0;
  const clear = UV_CLEAR_SKY_K * Math.sin(elevationDeg * RAD) ** 2.42;
  const cloud = Math.min(100, Math.max(0, cloudPct)) / 100;
  return clear * (1 - 0.75 * cloud ** 3.4);
}
