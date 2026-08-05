import { useEffect, useState } from 'react';
import { getThemePreference, subscribeThemePreference } from './themeStore';

function resolveMode(): 'light' | 'dark' {
  const preference = getThemePreference();
  if (preference !== 'auto') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Resolved theme, for the many call sites (chart strokes, table swatches, tooltip
// ink) that need a plain 'light' | 'dark' at the JS level rather than a CSS token.
// Reacts to both the OS scheme (while the preference is 'auto') and an explicit
// choice made via useThemePreference — those are two different signals, so both
// are subscribed to independently.
export function useColorScheme(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>(() => resolveMode());

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setMode(resolveMode());
    mql.addEventListener('change', update);
    const unsubscribe = subscribeThemePreference(update);
    return () => {
      mql.removeEventListener('change', update);
      unsubscribe();
    };
  }, []);

  return mode;
}
