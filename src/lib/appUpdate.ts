import { createContext, useContext } from 'react';

/**
 * Whether a new version is waiting, and how to switch to it. Provided once by
 * `Root` (the app's only `useRegisterSW` call) so every screen agrees.
 * Without a provider (e.g. a component rendered on its own in a test) there's
 * never an update.
 */
export interface AppUpdate {
  ready: boolean;
  update: () => void;
}

export const AppUpdateContext = createContext<AppUpdate>({ ready: false, update: () => {} });

export const useAppUpdate = () => useContext(AppUpdateContext);
