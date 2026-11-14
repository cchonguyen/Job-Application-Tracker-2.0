import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  loadThemePreference,
  saveThemePreference,
  type ThemeAccent,
  type ThemeMode,
  type ThemePreference,
} from '../lib/theme';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>(() => loadThemePreference());

  useEffect(() => {
    applyTheme(theme);
    saveThemePreference(theme);

    if (theme.mode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      applyTheme(theme, document.documentElement, event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setMode = useCallback((mode: ThemeMode) => {
    setThemeState((prev) => ({ ...prev, mode }));
  }, []);

  const setAccent = useCallback((accent: ThemeAccent) => {
    setThemeState((prev) => ({ ...prev, accent }));
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
  }, []);

  return { theme, setTheme, setMode, setAccent };
}
