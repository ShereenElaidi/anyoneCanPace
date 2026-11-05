/**
 * DEV ONLY: a fake GPS that runs along a route, so the 6K follow view can be
 * tried at a desk. Loaded by main.tsx only when `import.meta.env.DEV` and the
 * URL has `?sim`, so it never reaches a production build.
 *
 *   http://localhost:5173/anyoneCanPace/?sim                 Sample Loop, from the start
 *   ?sim=pi-day                                               another route
 *   ?sim&away=300                                             begin 300 m north of the start
 *   ?sim&speed=5                                              start at 5× (also changeable in the panel)
 *
 * A small panel (bottom left) has Run/Pause, speed, "Go off route" and Restart.
 * One fix per second of real time, like a phone. Positions stay in memory.
 */
import { offsetPoint, type LatLon } from '../nav/geo';
import { bearingAt, pointAt, type PreparedRoute } from '../nav/route';
import { loadRoute } from '../sixk/data';

/** Easy run/walk pace: 2.8 m/s ≈ 6:00 /km. */
export const SIM_PACE_MPS = 2.8;
/** How far to the side "Go off route" takes you, and how fast you drift there. */
export const SIM_DETOUR_M = 80;
const DETOUR_STEP_M = 20;
const SPEEDS = [1, 3, 10] as const;

/**
 * Where the simulated runner is after moving `travelledM`: first in a straight
 * line from `start` to the route's first point (when starting away), then along
 * the route, shifted `lateralM` to the right of travel.
 */
export function simPosition(route: PreparedRoute, start: LatLon | null, awayM: number, travelledM: number, lateralM: number): LatLon {
  if (start && awayM > 0 && travelledM < awayM) {
    const t = travelledM / awayM;
    const end = route.points[0];
    return { lat: start.lat + t * (end.lat - start.lat), lon: start.lon + t * (end.lon - start.lon) };
  }
  const along = Math.min(route.lengthM, Math.max(0, travelledM - (start ? awayM : 0)));
  const p = pointAt(route, along);
  return lateralM ? offsetPoint(p, bearingAt(route, Math.min(along, route.lengthM - 1)) + 90, lateralM) : p;
}

export function installSimulatedGps(params: URLSearchParams): void {
  const routeId = params.get('sim') || 'sample-loop';
  const awayM = Math.max(0, Number(params.get('away')) || 0);
  const requested = Number(params.get('speed'));
  let speed: number = SPEEDS.includes(requested as (typeof SPEEDS)[number]) ? requested : 1;

  let route: PreparedRoute | null = null;
  let start: LatLon | null = null;
  let travelledM = 0;
  let lateralM = 0;
  let detour = false;
  let running = false;
  let nextId = 1;
  const watchers = new Map<number, PositionCallback>();

  const current = (): GeolocationPosition | null => {
    if (!route) return null;
    const p = simPosition(route, start, awayM, travelledM, lateralM);
    return {
      coords: { latitude: p.lat, longitude: p.lon, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    } as GeolocationPosition;
  };

  const emit = () => {
    const pos = current();
    if (pos) for (const cb of watchers.values()) cb(pos);
    render();
  };

  const tick = () => {
    if (!route) return;
    const total = route.lengthM + (awayM > 0 ? awayM : 0);
    if (running) travelledM = Math.min(total, travelledM + SIM_PACE_MPS * speed);
    if (travelledM >= total) running = false;
    const target = detour ? SIM_DETOUR_M : 0;
    lateralM += Math.max(-DETOUR_STEP_M, Math.min(DETOUR_STEP_M, target - lateralM));
    emit();
  };

  const fake: Geolocation = {
    getCurrentPosition(success) {
      queueMicrotask(() => {
        const pos = current();
        if (pos) success(pos);
      });
    },
    watchPosition(success) {
      const id = nextId++;
      watchers.set(id, success);
      queueMicrotask(emit);
      return id;
    },
    clearWatch(id) {
      watchers.delete(id);
    },
  };
  Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true });

  // ---------- Panel ----------
  const panel = document.createElement('div');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Simulated GPS (dev only)');
  panel.style.cssText =
    // A narrow column on the right edge, over the map, clear of the banner and the bottom buttons.
    'position:fixed;right:6px;top:50%;transform:translateY(-50%);z-index:2147483647;display:flex;flex-direction:column;' +
    'align-items:stretch;gap:5px;width:84px;padding:6px;border:2px dashed #2c2c2a;border-radius:12px;background:#fffdf8e8;' +
    'text-align:center;' +
    'font:700 12px/1.2 var(--font, monospace);color:#2c2c2a;box-shadow:0 2px 8px rgb(0 0 0 / .2)';
  const label = document.createElement('span');
  const button = (text: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText = 'min-height:36px;padding:4px 8px;border:2px solid #2c2c2a;border-radius:10px;background:#fff;font:inherit;cursor:pointer';
    b.addEventListener('click', onClick);
    panel.append(b);
    return b;
  };
  panel.append(label);
  const runBtn = button('▶ RUN', () => {
    running = !running;
    render();
  });
  const speedBtn = button('', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
    render();
  });
  const detourBtn = button('', () => {
    detour = !detour;
    render();
  });
  button('↺', () => {
    travelledM = 0;
    lateralM = 0;
    detour = false;
    running = false;
    emit();
  }).setAttribute('aria-label', 'Restart the simulated run');

  function render() {
    if (!route) {
      label.textContent = `SIM: loading ${routeId}…`;
      return;
    }
    const onRouteM = Math.max(0, travelledM - awayM);
    const where = awayM > 0 && travelledM < awayM ? `${Math.round(awayM - travelledM)} m to start` : `${(onRouteM / 1000).toFixed(2)} km`;
    label.textContent = `SIM ${where}${lateralM ? ` ${Math.round(lateralM)} m off` : ''}`;
    runBtn.textContent = running ? '❚❚ PAUSE' : '▶ RUN';
    speedBtn.textContent = `×${speed}`;
    detourBtn.textContent = detour ? 'BACK ON' : 'GO OFF';
    detourBtn.title = detour ? 'Drift back onto the route' : `Drift ${SIM_DETOUR_M} m to the right of the route`;
  }

  const mount = () => document.body.append(panel);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  render();

  loadRoute(routeId)
    .then((r) => {
      route = r.prepared;
      start = awayM > 0 ? offsetPoint(route.points[0], 0, awayM) : null;
      emit();
      window.setInterval(tick, 1000);
    })
    .catch((err) => {
      label.textContent = `SIM: ${String(err)}`;
    });
}
