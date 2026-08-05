import { useSyncExternalStore } from 'react';
import {
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from './themeStore';

const getServerSnapshot = (): ThemePreference => 'auto';

// The explicit light/dark/auto choice from the app bar's theme control, persisted
// under `mf-theme`. Separate from useColorScheme, which reports the *resolved*
// mode — this reports the *preference*, so the control itself knows which of its
// three options is active.
export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    getServerSnapshot,
  );
  return [preference, setThemePreference];
}
