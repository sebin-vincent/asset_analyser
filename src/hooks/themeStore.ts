// A tiny module-level store for the user's theme preference. It exists because
// `useColorScheme` is called independently from many leaf components (chart,
// tables, chips) with no prop drilling — when the app bar's theme control
// changes the preference, every one of those call sites needs to hear about
// it without App having to pass a `mode` prop down through everything.
export type ThemePreference = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'mf-theme';
const listeners = new Set<() => void>();

function isPreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto';
}

function readStored(): ThemePreference {
  if (typeof window === 'undefined') return 'auto';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return isPreference(raw) ? raw : 'auto';
}

function applyToDocument(pref: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // 'auto' removes the attribute entirely so the prefers-color-scheme media
  // query in index.css takes back over.
  if (pref === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

let preference: ThemePreference = readStored();
applyToDocument(preference);

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
  applyToDocument(next);
  listeners.forEach((listener) => listener());
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
