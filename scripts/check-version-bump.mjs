// Fails unless package.json's version is strictly greater than the base branch's.
// Usage: node scripts/check-version-bump.mjs <base-ref>   (e.g. origin/main)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseRef = process.argv[2] || 'origin/main';

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  if (!m) throw new Error(`"${v}" is not a MAJOR.MINOR.PATCH version`);
  return m.slice(1).map(Number);
};

const compare = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

const head = JSON.parse(readFileSync('package.json', 'utf-8')).version;
const base = JSON.parse(
  execFileSync('git', ['show', `${baseRef}:package.json`], { encoding: 'utf-8' }),
).version;

if (compare(parse(head), parse(base)) <= 0) {
  console.error(
    `package.json version ${head} must be greater than ${base} on ${baseRef}.\n` +
      'Bump it in this PR: MINOR for features, PATCH for fixes (see AGENTS.md).',
  );
  process.exit(1);
}

console.log(`Version bump OK: ${base} -> ${head}`);
