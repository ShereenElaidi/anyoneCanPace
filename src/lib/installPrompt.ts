/**
 * Catches the browser's install prompt (`beforeinstallprompt`, Chrome/Edge/Samsung
 * on Android) so the home screen can offer an INSTALL button, and remembers when
 * the person said NOT NOW. Nothing leaves the phone.
 *
 * The event can fire before React mounts, so `listenForInstallPrompt()` runs at
 * startup (main.tsx) and the component reads this store.
 */

/** Chrome's event; not in TypeScript's DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chrome's own mini-bar away; the home screen's hint offers the same prompt.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A prompt is ready to be shown. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Installed during this visit (the page itself keeps running in the browser tab). */
export function installedThisVisit(): boolean {
  return installedNow;
}

/** Opens the browser's install prompt. A prompt can only be used once. */
export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  notify();
  await e.prompt();
  await e.userChoice.catch(() => undefined);
}

/** Running from the home screen (Android/desktop) or as an iOS home-screen app. */
export function runningInstalled(): boolean {
  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// ---------- NOT NOW ----------

const DISMISS_KEY = 'anyonecanpace:install-hint-dismissed:v1';

export function installHintDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Storage blocked: the hint stays hidden for this visit only.
  }
}

/** Test helper: forget any caught prompt. */
export function resetInstallPromptForTests(): void {
  deferred = null;
  installedNow = false;
}

/** Test helper: pretend the browser offered a prompt. */
export function setInstallPromptForTests(e: BeforeInstallPromptEvent | null): void {
  deferred = e;
  notify();
}
