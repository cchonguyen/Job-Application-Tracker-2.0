import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  isThemeAccent,
  isThemeMode,
  parseThemePreference,
} from '../theme';

describe('theme preference helpers', () => {
  it('accepts valid modes and accents', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('auto')).toBe(false);
    expect(isThemeAccent('cyan')).toBe(true);
    expect(isThemeAccent('teal')).toBe(true);
    expect(isThemeAccent('purple')).toBe(false);
    expect(DEFAULT_THEME.accent).toBe('cyan');
  });

  it('parses stored preferences with defaults for bad values', () => {
    expect(parseThemePreference(null)).toEqual(DEFAULT_THEME);
    expect(parseThemePreference('not-json')).toEqual(DEFAULT_THEME);
    expect(parseThemePreference(JSON.stringify({ mode: 'dark', accent: 'rose' }))).toEqual({
      mode: 'dark',
      accent: 'rose',
    });
    expect(parseThemePreference(JSON.stringify({ mode: 'neon', accent: 'teal' }))).toEqual({
      mode: 'light',
      accent: 'teal',
    });
  });
});
