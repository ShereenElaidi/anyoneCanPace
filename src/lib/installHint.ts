/**
 * When and how the home screen suggests installing the app. Pure: the caller
 * passes in what it read from `navigator`, `matchMedia` and storage.
 *
 * Phones don't announce installable sites reliably: iOS never prompts (only
 * Share → Add to Home Screen works), and Chrome on Android shows its own prompt
 * rarely and hides it for months once dismissed. So the app says it itself.
 */

/** iOS/iPadOS (every browser there installs through the Share sheet), Android, or anything else. */
export type InstallPlatform = 'ios' | 'android' | 'other';

export interface DeviceInfo {
  userAgent: string;
  /** `navigator.maxTouchPoints`: iPadOS reports a Mac user agent, but a touch screen. */
  maxTouchPoints: number;
}

export function installPlatform({ userAgent, maxTouchPoints }: DeviceInfo): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

/**
 * What the hint shows:
 * - `prompt`: the browser handed us its install prompt, so an INSTALL button opens it.
 * - `ios-share`: Share, then Add to Home Screen.
 * - `browser-menu`: Android without a prompt (Firefox, Samsung Internet, or Chrome
 *   that hasn't offered one): the browser's ⋮ menu, then Install / Add to Home screen.
 * - `none`: already installed, dismissed, or a computer.
 */
export type InstallHintKind = 'prompt' | 'ios-share' | 'browser-menu' | 'none';

export interface InstallHintInput {
  platform: InstallPlatform;
  /** Running from the home screen already (`display-mode: standalone`, or iOS `navigator.standalone`). */
  installed: boolean;
  /** The person tapped NOT NOW before. */
  dismissed: boolean;
  /** A `beforeinstallprompt` event is waiting to be used. */
  canPrompt: boolean;
}

export function installHintKind({ platform, installed, dismissed, canPrompt }: InstallHintInput): InstallHintKind {
  if (installed || dismissed) return 'none';
  if (platform === 'ios') return 'ios-share';
  if (platform === 'android') return canPrompt ? 'prompt' : 'browser-menu';
  // Computers: only when the browser itself says it can install, never as instructions.
  return 'none';
}
