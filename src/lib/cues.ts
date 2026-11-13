import type { Phase } from '../timer/engine';

/**
 * Short synthesized beeps (no audio files) and vibration patterns.
 * RUN: two quick higher beeps ("go go"). WALK: one longer, lower beep.
 *
 * Browsers only allow audio after a user gesture, so `unlockAudio()` must be
 * called from a tap handler (Start / Resume) before cues can play.
 */

let ctx: AudioContext | null = null;
let limiter: DynamicsCompressorNode | null = null;
let limiterFor: AudioContext | null = null;

/**
 * Loud beeps (on by default): harsher sawtooth wave at full level, pitched about
 * 1.5 octaves higher (phone speakers and ears are strongest around 2-4 kHz), through a
 * compressor so the peaks don't clip. RUN and WALK cues repeat three times, like an alarm.
 * Off: the original soft triangle beeps. Set from the saved preference.
 */
let loud = true;
export function setLoudCues(on: boolean): void {
  loud = on;
}
const LOUD_PITCH = 3;
export const LOUD_REPEATS = 3;

function output(audio: AudioContext): AudioNode {
  if (!loud) return audio.destination;
  if (!limiter || limiterFor !== audio) {
    limiter = audio.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(audio.destination);
    limiterFor = audio;
  }
  return limiter;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

export function unlockAudio(): void {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return;
  try {
    ctx ??= new Ctor();
    if (ctx.state !== 'running') void ctx.resume();
    // iOS needs a sound started inside the gesture to fully unlock output.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  } catch {
    ctx = null;
  }
}

function beep(audio: AudioContext, at: number, frequency: number, duration: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = loud ? 'sawtooth' : 'triangle';
  osc.frequency.value = loud ? frequency * LOUD_PITCH : frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(loud ? 1 : 0.5, at + 0.015);
  // Hold loud beeps at full level for most of their length instead of fading straight out.
  if (loud) gain.gain.setValueAtTime(1, at + Math.max(0.016, duration - 0.03));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(output(audio));
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

export function playCue(phase: Phase): void {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const t = ctx.currentTime + 0.01;
    const times = loud ? LOUD_REPEATS : 1;
    for (let i = 0; i < times; i++) {
      if (phase === 'run') {
        const at = t + i * 0.8;
        beep(ctx, at, 988, 0.14);
        beep(ctx, at + 0.22, 988, 0.14);
      } else {
        beep(ctx, t + i * 0.7, 587, 0.45);
      }
    }
  } catch {
    // Never let a sound failure affect the timer.
  }
}

export const canVibrate = (): boolean => typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function vibrateCue(phase: Phase): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(phase === 'run' ? [120, 80, 120] : [350]);
  } catch {
    // Ignore: some browsers block vibration without recent interaction.
  }
}

// ---------- Route-following cues ----------

/** What a route cue is about. Turn directions are grouped: slight/sharp count as left/right. */
export type NavCue = 'left' | 'right' | 'u-turn' | 'straight' | 'off-route' | 'finished';

/** One pulse for left, two for right, one long for a U-turn. */
export const NAV_VIBRATION: Record<NavCue, number[]> = {
  left: [220],
  right: [150, 120, 150],
  'u-turn': [700],
  straight: [80],
  'off-route': [90, 70, 90, 70, 90],
  finished: [200, 100, 200, 100, 500],
};

export function navCueFor(dir: string): NavCue {
  if (dir.endsWith('left')) return 'left';
  if (dir.endsWith('right')) return 'right';
  if (dir === 'u-turn') return 'u-turn';
  return 'straight';
}

export function vibrateNav(cue: NavCue): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(NAV_VIBRATION[cue]);
  } catch {
    // Ignore, as for the timer cues.
  }
}

/** Beeps that mirror the vibration patterns, so phones without vibration (iPhone) still get a cue. */
export function playNavCue(cue: NavCue): void {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const t = ctx.currentTime + 0.01;
    switch (cue) {
      case 'left':
        beep(ctx, t, 784, 0.18);
        break;
      case 'right':
        beep(ctx, t, 784, 0.12);
        beep(ctx, t + 0.2, 784, 0.12);
        break;
      case 'u-turn':
        beep(ctx, t, 523, 0.6);
        break;
      case 'straight':
        beep(ctx, t, 659, 0.08);
        break;
      case 'off-route':
        beep(ctx, t, 440, 0.1);
        beep(ctx, t + 0.16, 440, 0.1);
        beep(ctx, t + 0.32, 440, 0.1);
        break;
      case 'finished':
        beep(ctx, t, 659, 0.14);
        beep(ctx, t + 0.18, 784, 0.14);
        beep(ctx, t + 0.36, 988, 0.3);
        break;
    }
  } catch {
    // Never let a sound failure affect navigation.
  }
}
