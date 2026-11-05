import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Status } from '../timer/engine';
import { MenuSheet } from './MenuSheet';

function sheet(status: Status, updateReady = true) {
  const onUpdate = vi.fn();
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
      updateReady={updateReady}
      onToggleSound={() => {}}
      onToggleVibration={() => {}}
      onReset={onReset}
      onUpdate={onUpdate}
    />,
  );
  return { onUpdate, onReset };
}

describe('Settings: updates only when no session exists', () => {
  it('ready (no session): offers the update', () => {
    const { onUpdate } = sheet('ready');
    fireEvent.click(screen.getByRole('button', { name: 'UPDATE TO NEW VERSION' }));
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  for (const status of ['active', 'paused'] as const) {
    it(`${status}: no update button, just a note to end the session first`, () => {
      sheet(status);
      expect(screen.queryByRole('button', { name: 'UPDATE TO NEW VERSION' })).toBeNull();
      expect(screen.getByText('A new version is ready. End the session to update.')).toBeTruthy();
    });
  }

  it('paused: ending the session still needs two taps', () => {
    const { onReset } = sheet('paused');
    fireEvent.click(screen.getByRole('button', { name: 'END & RESET SESSION' }));
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'TAP AGAIN TO END SESSION' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('no update waiting: nothing about updates', () => {
    sheet('paused', false);
    expect(screen.queryByText(/new version/i)).toBeNull();
  });
});
