import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playCue, setLoudCues, unlockAudio } from './cues';

const oscillators: { type: string; frequency: { value: number } }[] = [];
let compressors = 0;

function param() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

class FakeAudio {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn();
  createBuffer = () => ({});
  createBufferSource = () => ({ connect: vi.fn(), start: vi.fn(), buffer: null });
  createGain = () => ({ gain: param(), connect: (n: unknown) => n });
  createDynamicsCompressor = () => {
    compressors++;
    return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() };
  };
  createOscillator = () => {
    const o = { type: '', frequency: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() };
    oscillators.push(o);
    return o;
  };
}

describe('sound cues', () => {
  beforeEach(() => {
    oscillators.length = 0;
    compressors = 0;
    vi.stubGlobal('AudioContext', FakeAudio);
    unlockAudio();
  });
  afterEach(() => {
    setLoudCues(true);
    vi.unstubAllGlobals();
  });

  it('loud: RUN is two beeps repeated three times, high-pitched sawtooth through a compressor', () => {
    setLoudCues(true);
    playCue('run');
    expect(oscillators).toHaveLength(6);
    expect(oscillators.every((o) => o.type === 'sawtooth' && o.frequency.value === 988 * 3)).toBe(true);
    expect(compressors).toBe(1);
  });

  it('loud: WALK is one long beep repeated three times', () => {
    setLoudCues(true);
    playCue('walk');
    expect(oscillators).toHaveLength(3);
  });

  it('soft: the original single pattern, triangle at the original pitch', () => {
    setLoudCues(false);
    playCue('run');
    expect(oscillators).toHaveLength(2);
    expect(oscillators.every((o) => o.type === 'triangle' && o.frequency.value === 988)).toBe(true);
  });
});
