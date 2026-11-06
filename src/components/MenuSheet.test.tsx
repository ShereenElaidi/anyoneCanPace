import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Status } from '../timer/engine';
import { MenuSheet } from './MenuSheet';

function sheet(status: Status) {
  const onReset = vi.fn();
  render(
    <MenuSheet
      open
      onClose={() => {}}
      status={status}
      sound
      vibration
      vibrationSupported
      wakeLock="off"
      onToggleSound={() => {}}
      onToggleVibration={() => {}}
      onReset={onReset}
    />,
  );
  return { onReset };
}

describe('Settings sheet', () => {
  it('paused: ending the session still needs two taps', () => {
    const { onReset } = sheet('paused');
    fireEvent.click(screen.getByRole('button', { name: 'END & RESET SESSION' }));
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'TAP AGAIN TO END SESSION' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  // Updates are offered only by the UpdateBanner, never in Settings.
  for (const status of ['ready', 'active', 'paused'] as const) {
    it(`${status}: nothing about updates`, () => {
      sheet(status);
      expect(screen.queryByText(/new version/i)).toBeNull();
    });
  }
});
