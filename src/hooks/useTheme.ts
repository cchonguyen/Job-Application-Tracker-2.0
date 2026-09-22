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
