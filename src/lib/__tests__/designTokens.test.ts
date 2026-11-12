import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATUS_META, STATUS_ORDER } from '../statusMeta';
import { getStatusBorderAccent, getStatusDotColor } from '../formatHelpers';
import { THEME_ACCENTS, DEFAULT_THEME } from '../theme';
import type { JobStatus } from '../../types';

const root = resolve(__dirname, '../../..');
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
const indexCss = readFileSync(resolve(root, 'src/index.css'), 'utf8');

describe('status color tokens', () => {
  it('defines every status once, in STATUS_ORDER', () => {
    expect(Object.keys(STATUS_META).sort()).toEqual([...STATUS_ORDER].sort());
  });

  it('dot and border helpers read from STATUS_META', () => {
    for (const status of STATUS_ORDER) {
      expect(getStatusDotColor(status)).toBe(STATUS_META[status].dot);
      expect(getStatusBorderAccent(status)).toBe(STATUS_META[status].borderAccent);
    }
  });

  it('every surface of a status uses the same hue', () => {
    for (const status of STATUS_ORDER) {
      const m = STATUS_META[status];
      const hue = m.iconClass.replace(/^text-([a-z]+)-\d+$/, '$1');
      for (const cls of [m.badge, m.chipBg, m.dot, m.borderAccent]) {
        expect(cls, `${status}: ${cls}`).toContain(`-${hue}-`);
      }
    }
  });

  it('never uses the accent-remapped indigo scale', () => {
    for (const status of STATUS_ORDER) {
      const m = STATUS_META[status];
      expect([m.badge, m.iconClass, m.chipBg, m.dot, m.borderAccent].join(' ')).not.toMatch(/indigo-/);
    }
  });

  it('falls back safely for unknown statuses', () => {
    expect(getStatusDotColor('Ghosted' as JobStatus)).toBe('bg-slate-300');
    expect(getStatusBorderAccent('Ghosted' as JobStatus)).toBe('border-l-slate-300');
  });
});

describe('accent palette contract', () => {
  const accentIds = THEME_ACCENTS.map((a) => a.id).sort();

  it('index.html pre-paint script lists the same accents as theme.ts', () => {
    const match = indexHtml.match(/var accents = \{([^}]*)\}/);
    expect(match).not.toBeNull();
    const htmlIds = match![1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean).sort();
    expect(htmlIds).toEqual(accentIds);
  });

  it('index.css defines a full 50-950 scale for every accent', () => {
    for (const id of accentIds) {
      const block = indexCss.match(new RegExp(`\\[data-accent="${id}"\\]\\s*\\{([^}]*)\\}`));
      expect(block, id).not.toBeNull();
      const steps = [...block![1].matchAll(/--color-indigo-(\d+):/g)].map((m) => m[1]);
      expect(steps).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']);
    }
  });

  it('accent swatches match the 600 step in index.css', () => {
    for (const accent of THEME_ACCENTS) {
      const block = indexCss.match(new RegExp(`\\[data-accent="${accent.id}"\\]\\s*\\{([^}]*)\\}`))![1];
      const step600 = block.match(/--color-indigo-600:\s*([^;]+);/)![1].trim();
      expect(step600).toBe(accent.swatch);
    }
  });

  it('index.html theme-color is the default accent 600 step', () => {
    expect(DEFAULT_THEME.accent).toBe('indigo');
    expect(indexHtml).toContain('<meta name="theme-color" content="#4f46e5" />');
  });
});
