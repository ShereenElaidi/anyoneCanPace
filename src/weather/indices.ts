/**
 * Environment Canada's wind chill and humidex. Pure. Used only for warnings
 * and display: clothing rules read the air temperature, so wind is never
 * counted twice.
 */

/** Wind chill (°C) from air temperature (°C) and wind at 10 m (km/h). Equals the air temperature when it doesn't apply (above 10 °C or under 5 km/h). */
export function windChill(tempC: number, windKmh: number): number {
  if (tempC > 10 || windKmh < 5) return tempC;
  const v = windKmh ** 0.16;
  return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
}

/** Humidex from air temperature and dew point (°C). */
export function humidex(tempC: number, dewPointC: number): number {
  const vapourHpa = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewPointC)));
  return tempC + 0.5555 * (vapourHpa - 10);
}
