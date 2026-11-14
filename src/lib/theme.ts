export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeAccent = 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo';

export interface ThemePreference {
  mode: ThemeMode;
  accent: ThemeAccent;
}

export const THEME_STORAGE_KEY = 'jat-theme';

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export const THEME_ACCENTS: { id: ThemeAccent; label: string; swatch: string }[] = [
  { id: 'cyan', label: 'Cyan', swatch: 'oklch(50.3% 0.095 210.8)' },
  { id: 'emerald', label: 'Emerald', swatch: 'oklch(59.6% 0.145 163.225)' },
  { id: 'amber', label: 'Amber', swatch: 'oklch(66.6% 0.179 58.318)' },
  { id: 'rose', label: 'Rose', swatch: 'oklch(58.6% 0.253 17.585)' },
  { id: 'indigo', label: 'Indigo', swatch: 'oklch(51.1% 0.262 276.966)' },
];

export const DEFAULT_THEME: ThemePreference = {
  mode: 'light',
  accent: 'cyan',
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isThemeAccent(value: unknown): value is ThemeAccent {
  return (
    value === 'cyan' ||
    value === 'indigo' ||
    value === 'amber' ||
    value === 'rose' ||
    value === 'emerald'
  );
}

export function resolveThemeMode(mode: ThemeMode, prefersDark?: boolean): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof prefersDark === 'boolean') return prefersDark ? 'dark' : 'light';
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  if (!raw) return { ...DEFAULT_THEME };
  try {
    const parsed = JSON.parse(raw) as Partial<ThemePreference>;
    return {
      mode: isThemeMode(parsed.mode) ? parsed.mode : DEFAULT_THEME.mode,
      accent: isThemeAccent(parsed.accent) ? parsed.accent : DEFAULT_THEME.accent,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function loadThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return { ...DEFAULT_THEME };
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveThemePreference(theme: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Ignore quota / private-mode failures
  }
}

export function applyTheme(
  theme: ThemePreference,
  root: HTMLElement = document.documentElement,
  prefersDark?: boolean
): void {
  const resolvedMode = resolveThemeMode(theme.mode, prefersDark);
  root.dataset.mode = resolvedMode;
  root.dataset.theme = resolvedMode;
  root.dataset.accent = theme.accent;
  root.style.colorScheme = resolvedMode;
}
