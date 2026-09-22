import { useEffect, useRef, useState } from 'react';
import { Check, Moon, Palette, Sun } from 'lucide-react';
import { THEME_ACCENTS, THEME_MODES, type ThemeAccent, type ThemeMode } from '../lib/theme';

interface ThemeSelectorProps {
  mode: ThemeMode;
  accent: ThemeAccent;
  onModeChange: (mode: ThemeMode) => void;
  onAccentChange: (accent: ThemeAccent) => void;
}

export function ThemeSelector({ mode, accent, onModeChange, onAccentChange }: ThemeSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Theme settings"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
      >
        <Palette className="w-3.5 h-3.5 text-indigo-600" />
        <span className="hidden sm:inline">Theme</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose theme"
          className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 animate-in fade-in slide-in-from-top-1 duration-100"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Appearance</p>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {THEME_MODES.map((option) => {
              const selected = mode === option.id;
              const Icon = option.id === 'light' ? Sun : Moon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onModeChange(option.id)}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    selected
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Accent</p>
          <div className="grid grid-cols-5 gap-2">
            {THEME_ACCENTS.map((option) => {
              const selected = accent === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.label}
                  aria-label={`${option.label} accent`}
                  aria-pressed={selected}
                  onClick={() => onAccentChange(option.id)}
                  className={`relative w-9 h-9 rounded-full border-2 transition-transform cursor-pointer hover:scale-105 ${
                    selected ? 'border-slate-900 scale-105' : 'border-slate-200'
                  }`}
                  style={{ backgroundColor: option.swatch }}
                >
                  {selected && (
                    <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto drop-shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
