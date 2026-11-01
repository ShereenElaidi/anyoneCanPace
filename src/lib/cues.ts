import type { Phase } from '../timer/engine';

/**
 * Short synthesized beeps (no audio files) and vibration patterns.
 * RUN: two quick higher beeps ("go go"). WALK: one longer, lower beep.
 *
 * Browsers only allow audio after a user gesture, so `unlockAudio()` must be
 * called from a tap handler (Start / Resume) before cues can play.
 */

let ctx: AudioContext | null = null;

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
  osc.type = 'triangle';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

export function playCue(phase: Phase): void {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const t = ctx.currentTime + 0.01;
    if (phase === 'run') {
      beep(ctx, t, 988, 0.14);
      beep(ctx, t + 0.22, 988, 0.14);
    } else {
      beep(ctx, t, 587, 0.45);
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
