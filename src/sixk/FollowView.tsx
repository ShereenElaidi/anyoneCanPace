import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { GEO_ERROR_TEXT, useGeolocation } from '../hooks/useGeolocation';
import { useWakeLock } from '../hooks/useWakeLock';
import { canVibrate, unlockAudio } from '../lib/cues';
import { loadPrefs, savePrefs, type Prefs } from '../lib/prefs';
import { describe as describeBanner, formatKm, statsLine, type Banner } from '../nav/banner';
import { POOR_ACCURACY_M } from '../nav/constants';
import { approachInfo, duckLost, gpsHealth, joinOptions } from '../nav/tracker';
import { bearingAt, pointAt, splitAt } from '../nav/route';
import type { LoadedRoute } from './data';
import { TurnIcon } from './TurnIcon';
import { useRouteNav } from './useRouteNav';

const RouteMap = lazy(() => import('./map/RouteMap'));

interface Props {
  route: LoadedRoute;
  onExit: () => void;
  /** Set by the parent when the system back gesture is used mid-route. */
  menuRequest: number;
}

export function FollowView({ route, onExit, menuRequest }: Props) {
  const { data, track, prepared } = route;
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [menuOpen, setMenuOpen] = useState(false);
  const geo = useGeolocation(true);
  const nav = useRouteNav(prepared, geo.fix, prefs);
  const { state } = nav;
  const wakeLock = useWakeLock(state.status !== 'finished');
  // A clock for "no GPS lately": fixes stop arriving exactly when it matters.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, []);
  const health = gpsHealth(state, Math.max(now, state.lastFix?.at ?? 0));

  useEffect(() => savePrefs(prefs), [prefs]);
  useEffect(() => {
    if (menuRequest > 0) setMenuOpen(true);
  }, [menuRequest]);

  // No fix because GPS is blocked or failing: say so in the banner itself.
  const gpsProblem = geo.error && !state.lastFix ? geo.error : null;
  const banner: Banner = gpsProblem
    ? { icon: 'gps', primary: 'No GPS yet', secondary: GEO_ERROR_TEXT[gpsProblem], tone: 'warning' }
    : describeBanner(prepared, state, data.startStreet);
  const following = state.status === 'following';
  const started = state.status !== 'approach';

  // Duck: always at your GPS position (on route, off route, going rogue). Once joined, it faces the
  // route's direction at your progress, and that point is kept in view while you're off route.
  const duck = useMemo(() => {
    const onRoute = started && state.anchored ? pointAt(prepared, state.progressM) : null;
    const at = state.lastFix ?? onRoute;
    if (!at) return null;
    const facingLeft = onRoute ? bearingAt(prepared, Math.min(state.progressM, prepared.lengthM - 1)) > 180 : false;
    return {
      lon: at.lon,
      lat: at.lat,
      facingLeft,
      lost: duckLost(state),
      routePoint: onRoute ? { lon: onRoute.lon, lat: onRoute.lat } : undefined,
    };
  }, [started, state, prepared]);

  const split = useMemo(
    () => (started && state.anchored ? splitAt(prepared, state.progressM) : null),
    [started, state.anchored, state.progressM, prepared],
  );

  const atStart = state.lastFix ? approachInfo(prepared, state.lastFix).atStart : false;

  // Started, not joined, and several places on the route are plausible: let the pacer choose.
  const joinChoices =
    following && !state.anchored && state.lastFix && state.lastFix.accuracyM <= POOR_ACCURACY_M
      ? joinOptions(prepared, state.lastFix)
      : [];

  const start = () => {
    unlockAudio(); // this tap is the gesture browsers need before beeps can play
    nav.start();
  };

  const fix = state.lastFix;
  return (
    <div className="follow">
      <section
        className={`banner banner--${banner.tone}${health !== 'ok' ? ' banner--stale' : ''}`}
        aria-label={health !== 'ok' ? 'Directions (may be out of date)' : 'Directions'}
      >
        <TurnIcon icon={banner.icon} rotateDeg={banner.rotateDeg} className="banner__icon" />
        <div className="banner__text">
          <p className="banner__primary">{banner.primary}</p>
          {banner.secondary && <p className="banner__secondary">{banner.secondary}</p>}
        </div>
        {state.offRoute && !state.rogue && <span className="banner__badge">OFF ROUTE</span>}
      </section>

      {health !== 'ok' && (
        <p className="gps-warning" role="alert">
          <strong>{health === 'stale' ? 'GPS lost.' : 'GPS too rough.'}</strong>{' '}
          {health === 'stale'
            ? 'No location for over 10 seconds, so these directions may be out of date. Keep the screen on and the phone where it can see the sky.'
            : `Location is only accurate to about ${Math.round(state.lastFix?.accuracyM ?? 0)} m, so progress and turn cues are paused until it improves.`}
        </p>
      )}

      {started && <p className="follow__stats">{statsLine(prepared, state)}</p>}

      {joinChoices.length > 0 && (
        <div className="join-choices" role="group" aria-label="Join the route here">
          {joinChoices.map((c) => (
            <button key={c.alongM} type="button" className="btn btn--secondary btn--small" onClick={() => nav.join(c.alongM)}>
              JOIN AT {formatKm(c.alongM).toUpperCase()}
              <span className="join-choices__sub">{formatKm(prepared.lengthM - c.alongM)} to go</span>
            </button>
          ))}
        </div>
      )}
      {geo.error && !gpsProblem && <p className="notice notice--warn">{GEO_ERROR_TEXT[geo.error]}</p>}

      <div className="follow__map">
        <Suspense fallback={<p className="route-map route-map--loading">Loading map…</p>}>
          <RouteMap
            track={track}
            bbox={data.bbox}
            label={`Map of ${data.name}. The duck shows your position.`}
            follow
            covered={split?.covered}
            remaining={split?.remaining}
            duck={duck}
            fix={fix ? { lon: fix.lon, lat: fix.lat, accuracyM: fix.accuracyM } : null}
          />
        </Suspense>
      </div>

      <div className="follow__bar">
        {state.status === 'approach' && (
          <>
            <button type="button" className="btn btn--primary btn--block" onClick={start}>
              {atStart ? 'START ROUTE' : 'START ANYWAY'}
            </button>
            <p className="follow__hint">
              Keep this screen on. Locking the phone or switching apps pauses GPS until you’re back.
            </p>
          </>
        )}
        {state.status === 'finished' && (
          <button type="button" className="btn btn--primary btn--block" onClick={onExit}>
            BACK TO ROUTES
          </button>
        )}
        <button
          type="button"
          className="btn btn--secondary btn--small"
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          {state.status === 'approach' ? 'CANCEL' : 'MENU'}
        </button>
      </div>

      <p className="visually-hidden" aria-live="assertive" aria-atomic="true">
        {nav.announcement}
      </p>

      <RogueDialog
        open={nav.askRogue && following}
        distanceM={state.distanceFromRouteM}
        onYes={nav.goRogue}
        onNo={nav.dismissRogue}
      />

      <FollowMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        active={following}
        prefs={prefs}
        wakeLockOn={wakeLock === 'on'}
        accuracyM={fix?.accuracyM ?? null}
        onToggleSound={() => {
          unlockAudio();
          setPrefs((p) => ({ ...p, sound: !p.sound }));
        }}
        onToggleVibration={() => setPrefs((p) => ({ ...p, vibration: !p.vibration }))}
        onEnd={onExit}
      />
    </div>
  );
}

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return ref;
}

function RogueDialog(props: { open: boolean; distanceM: number | null; onYes: () => void; onNo: () => void }) {
  const ref = useDialog(props.open);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="rogue-title" onClose={props.onNo}>
      <div className="sheet__body">
        <h2 id="rogue-title" className="sheet__title">
          Going rogue?
        </h2>
        <p>
          You’re {props.distanceM ? `about ${Math.round(props.distanceM / 5) * 5} m` : 'a bit'} off the route. Going off
          on purpose? We’ll stop nagging until you’re back on it.
        </p>
        <button type="button" className="btn btn--primary btn--block" onClick={props.onYes}>
          YES, GEWWW AWAEYYY!
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={props.onNo}>
          AM STOOOPIDLY LOST. FINDING MY WAY BACK.
        </button>
      </div>
    </dialog>
  );
}

function FollowMenu(props: {
  open: boolean;
  onClose: () => void;
  active: boolean;
  prefs: Prefs;
  wakeLockOn: boolean;
  accuracyM: number | null;
  onToggleSound: () => void;
  onToggleVibration: () => void;
  onEnd: () => void;
}) {
  const ref = useDialog(props.open);
  const [confirming, setConfirming] = useState(false);
  const vibrationSupported = useMemo(canVibrate, []);

  useEffect(() => {
    if (!props.open) setConfirming(false);
  }, [props.open]);
  // The confirmation expires so a later stray tap can't trigger it.
  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  const end = () => {
    if (props.active && !confirming) {
      setConfirming(true);
      return;
    }
    props.onClose();
    props.onEnd();
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="follow-menu-title"
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose();
      }}
    >
      <div className="sheet__body">
        <div className="sheet__head">
          <h2 id="follow-menu-title">Route menu</h2>
          <button type="button" className="btn btn--secondary btn--small" onClick={props.onClose}>
            CLOSE
          </button>
        </div>

        <div className="toggle">
          <div>
            <p className="toggle__label">Sound cues</p>
            <p className="toggle__help">One beep for left, two for right, a long one for a U-turn.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={props.prefs.sound}
            aria-label="Sound cues"
            className="switch"
            onClick={props.onToggleSound}
          >
            <span className="switch__text">{props.prefs.sound ? 'ON' : 'OFF'}</span>
          </button>
        </div>
        <div className="toggle">
          <div>
            <p className="toggle__label">Vibration</p>
            <p className="toggle__help">
              {vibrationSupported ? 'Same patterns as the beeps.' : 'Not supported by this browser (including iPhone Safari).'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={props.prefs.vibration && vibrationSupported}
            aria-label="Vibration"
            className="switch"
            disabled={!vibrationSupported}
            onClick={props.onToggleVibration}
          >
            <span className="switch__text">{props.prefs.vibration && vibrationSupported ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <p className="sheet__note">
          {props.accuracyM === null ? 'No GPS fix yet.' : `GPS accuracy about ${Math.round(props.accuracyM)} m.`}{' '}
          {props.wakeLockOn ? 'Keeping the screen awake.' : 'Set auto-lock to “Never” to keep the screen on.'}
        </p>

        <button
          type="button"
          className={`btn btn--danger btn--block${confirming ? ' is-confirming' : ''}`}
          onClick={end}
        >
          {props.active ? (confirming ? 'TAP AGAIN TO END ROUTE' : 'END ROUTE') : 'BACK TO ROUTES'}
        </button>

        <details className="sheet__about">
          <summary>Good to know</summary>
          <ul>
            <li>GPS only works while this page is open and the screen is on. Locking the phone or switching apps pauses tracking; it catches up when you return, without replaying missed cues.</li>
            <li>Your location stays on this phone, only for this session. It is never saved or sent anywhere.</li>
            <li>The duck shows your place on the route. The small blue dot is the raw GPS position.</li>
          </ul>
        </details>
      </div>
    </dialog>
  );
}
