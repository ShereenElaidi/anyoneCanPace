import { describe, expect, it } from 'vitest';
import { installHintKind, installPlatform, type InstallHintInput } from './installHint';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
};

describe('installPlatform', () => {
  it('every iPhone browser is iOS', () => {
    expect(installPlatform({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe('ios');
    expect(installPlatform({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe('ios');
  });

  it('an iPad posing as a Mac is iOS; a real Mac is not', () => {
    expect(installPlatform({ userAgent: UA.ipadOs, maxTouchPoints: 5 })).toBe('ios');
    expect(installPlatform({ userAgent: UA.ipadOs, maxTouchPoints: 0 })).toBe('other');
    expect(installPlatform({ userAgent: UA.macChrome, maxTouchPoints: 0 })).toBe('other');
  });

  it('Android browsers are Android', () => {
    expect(installPlatform({ userAgent: UA.androidChrome, maxTouchPoints: 5 })).toBe('android');
    expect(installPlatform({ userAgent: UA.androidFirefox, maxTouchPoints: 5 })).toBe('android');
  });
});

describe('installHintKind', () => {
  const base: InstallHintInput = { platform: 'android', installed: false, dismissed: false, canPrompt: false };

  it('never shows once installed or dismissed', () => {
    for (const platform of ['ios', 'android', 'other'] as const) {
      expect(installHintKind({ ...base, platform, canPrompt: true, installed: true })).toBe('none');
      expect(installHintKind({ ...base, platform, canPrompt: true, dismissed: true })).toBe('none');
    }
  });

  it('iOS gets the Share sheet instructions', () => {
    expect(installHintKind({ ...base, platform: 'ios' })).toBe('ios-share');
  });

  it('Android gets an INSTALL button when the browser offers a prompt, else the menu instructions', () => {
    expect(installHintKind({ ...base, canPrompt: true })).toBe('prompt');
    expect(installHintKind(base)).toBe('browser-menu');
  });

  it('computers never get the hint', () => {
    expect(installHintKind({ ...base, platform: 'other' })).toBe('none');
    expect(installHintKind({ ...base, platform: 'other', canPrompt: true })).toBe('none');
  });
});
