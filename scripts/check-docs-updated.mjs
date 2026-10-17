// Fails when a PR changes app behavior without touching the docs that describe it.
// Usage: node scripts/check-docs-updated.mjs <base-ref>   (e.g. origin/main)
// PR_BODY (env) may contain a line "Docs: none needed - <reason>" to waive the first rule.
import { execFileSync } from 'node:child_process';

const baseRef = process.argv[2] || 'origin/main';
const prBody = process.env.PR_BODY || '';

const changed = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], { encoding: 'utf-8' })
  .split('\n')
  .filter(Boolean);

const isTest = (f) => f.includes('/__tests__/') || /\.test\.[cm]?[jt]sx?$/.test(f);
const isCode = (f) =>
  !isTest(f) &&
  (/^(src|server|supabase)\//.test(f) ||
    ['server.ts', 'render.yaml', '.env.example', 'vite.config.ts', 'index.html'].includes(f));
const isDoc = (f) => /^[^/]+\.md$/.test(f) || f.startsWith('docs/');

const code = changed.filter(isCode);
const docs = changed.filter(isDoc);
const waived = /^\s*Docs:\s*none needed\b/im.test(prBody);
const errors = [];

if (code.length && !docs.length && !waived) {
  errors.push(
    `This PR changes app files but no docs:\n  ${code.join('\n  ')}\n` +
      'Update PRD.md, README.md or docs/ to match (see "Documentation" in AGENTS.md), or, when the change\n' +
      'is invisible to anyone reading the docs, add a line "Docs: none needed - <reason>" to the PR description.',
  );
}

if (changed.includes('supabase/schema.sql') && !changed.includes('docs/MIGRATIONS.md')) {
  errors.push(
    'supabase/schema.sql changed without an entry in docs/MIGRATIONS.md. Add the SQL to run on the\n' +
      'production database and any manual steps around it.',
  );
}

if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exit(1);
}

console.log(
  code.length
    ? `Docs check OK: ${docs.length ? docs.join(', ') : 'waived in PR description'}`
    : 'Docs check OK: no app files changed',
);
