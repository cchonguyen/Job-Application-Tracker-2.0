import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execSync} from 'child_process';
import {readFileSync} from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Cloudflare exposes the deployed commit as WORKERS_CI_COMMIT_SHA (GITHUB_SHA in Actions); fall back to local git.
function resolveCommit(): string {
  const fromEnv = process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_COMMIT__: JSON.stringify(resolveCommit()),
      __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      // DISABLE_HMR=true turns off hot reload and file watching, so a coding agent editing many files does not make
      // the dev page flicker or reload on every save.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    },
  };
});
