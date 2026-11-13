import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetInstallPromptForTests, setInstallPromptForTests } from '../lib/installPrompt';
import { InstallHint } from './InstallHint';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

function asPhone(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

beforeEach(() => {
  localStorage.clear();
  resetInstallPromptForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('install hint on the home screen', () => {
  it('stays away on a computer', () => {
    render(<InstallHint />);
    expect(screen.queryByText('Add it to your home screen')).toBeNull();
  });

  it('on an iPhone explains Share → Add to Home Screen, and GOT IT hides it for good', () => {
    asPhone(IPHONE);
    const { unmount } = render(<InstallHint />);
    expect(screen.getByRole('heading', { name: 'Add it to your home screen' })).toBeTruthy();
    expect(screen.getByText('Add to Home Screen')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'INSTALL' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'GOT IT' }));
    expect(screen.queryByText('Add it to your home screen')).toBeNull();
    unmount();
    render(<InstallHint />);
    expect(screen.queryByText('Add it to your home screen')).toBeNull();
  });

  it('on Android without a prompt points to the browser menu', () => {
    asPhone(ANDROID);
    render(<InstallHint />);
    expect(screen.getByText('Install app')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'INSTALL' })).toBeNull();
  });

  it('on Android with a prompt, INSTALL opens the browser’s own prompt once', async () => {
    asPhone(ANDROID);
    render(<InstallHint />);
    const prompt = vi.fn(async () => {});
    act(() =>
      setInstallPromptForTests(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt,
          userChoice: Promise.resolve({ outcome: 'accepted' as const }),
        }),
      ),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'INSTALL' })));
    expect(prompt).toHaveBeenCalledTimes(1);
    // Used up: back to the menu instructions until the browser offers another one.
    expect(screen.queryByRole('button', { name: 'INSTALL' })).toBeNull();
  });

  it('never shows when already running from the home screen', () => {
    asPhone(IPHONE);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    try {
      render(<InstallHint />);
      expect(screen.queryByText('Add it to your home screen')).toBeNull();
    } finally {
      delete (navigator as Navigator & { standalone?: boolean }).standalone;
    }
  });
});
