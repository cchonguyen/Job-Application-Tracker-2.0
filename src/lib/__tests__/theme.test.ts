import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME,
  isThemeAccent,
  isThemeMode,
  parseThemePreference,
  resolveThemeMode,
} from '../theme';

describe('theme preference helpers', () => {
  it('accepts valid modes and accents', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('system')).toBe(true);
    expect(isThemeMode('auto')).toBe(false);
    expect(isThemeAccent('cyan')).toBe(true);
    expect(isThemeAccent('teal')).toBe(false);
    expect(isThemeAccent('purple')).toBe(false);
    expect(DEFAULT_THEME.mode).toBe('light');
    expect(DEFAULT_THEME.accent).toBe('cyan');
  });

  it('parses stored preferences with defaults for bad values', () => {
    expect(parseThemePreference(null)).toEqual(DEFAULT_THEME);
    expect(parseThemePreference('not-json')).toEqual(DEFAULT_THEME);
    expect(parseThemePreference(JSON.stringify({ mode: 'dark', accent: 'rose' }))).toEqual({
      mode: 'dark',
      accent: 'rose',
    });
    expect(parseThemePreference(JSON.stringify({ mode: 'system', accent: 'emerald' }))).toEqual({
      mode: 'system',
      accent: 'emerald',
    });
    expect(parseThemePreference(JSON.stringify({ mode: 'neon', accent: 'teal' }))).toEqual({
      mode: 'light',
      accent: 'cyan',
    });
  });

  it('resolves system mode using prefersDark and applies resolved attributes', () => {
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');

    const root = {
      dataset: {} as Record<string, string>,
      style: { colorScheme: '' },
    } as unknown as HTMLElement;

    applyTheme({ mode: 'system', accent: 'cyan' }, root, true);
    expect(root.dataset.mode).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.accent).toBe('cyan');
    expect(root.style.colorScheme).toBe('dark');

    applyTheme({ mode: 'system', accent: 'emerald' }, root, false);
    expect(root.dataset.mode).toBe('light');
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.accent).toBe('emerald');
    expect(root.style.colorScheme).toBe('light');
  });
});
