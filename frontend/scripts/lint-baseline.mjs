#!/usr/bin/env node
/**
 * Lint, and fail only if the number of problems has GROWN.
 *
 * WHY NOT JUST `eslint src`
 *   There are 30 long-standing errors, 24 of them the same react-hooks pattern
 *   that has been accumulating for months. Making CI fail on those would mean
 *   either fixing all of them before any other work could land, or - far more
 *   likely - switching the lint step off and never turning it back on.
 *
 * WHY NOT `--max-warnings`
 *   It only counts warnings. ESLint exits non-zero on any ERROR regardless, so
 *   that flag cannot express "these 30 are known".
 *
 * WHAT THIS DOES INSTEAD
 *   Counts problems and compares against a committed baseline. New mistakes
 *   push the count up and fail the build; fixing old ones pushes it down and
 *   the script tells you to lower the baseline, so the debt can only shrink.
 *
 *   Run `node scripts/lint-baseline.mjs` locally - same answer as CI.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = join(here, 'lint-baseline.json');

let report;
try {
  // ESLint exits non-zero when it finds problems, which is the normal case
  // here - so the output is read from the error rather than treated as failure.
  report = execFileSync('npx', ['eslint', 'src', '-f', 'json'], {
    cwd: join(here, '..'),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
} catch (err) {
  report = err.stdout;
  if (!report) {
    console.error('eslint could not run:\n', err.stderr || err.message);
    process.exit(2);
  }
}

const files = JSON.parse(report);
const problems = files.reduce((n, f) => n + f.messages.length, 0);

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify({ problems }, null, 2)}\n`);
  console.log(`Baseline updated to ${problems}.`);
  process.exit(0);
}

if (problems > baseline.problems) {
  console.error(`\nLint problems went UP: ${baseline.problems} -> ${problems}\n`);

  // Name what is new, so this is actionable rather than just a red cross.
  const counts = {};
  for (const f of files) {
    for (const m of f.messages) {
      const key = m.ruleId || '(syntax)';
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([rule, n]) => console.error(`  ${String(n).padStart(4)}  ${rule}`));

  console.error('\nFix the new ones. Run `npx eslint src` to see where they are.\n');
  process.exit(1);
}

if (problems < baseline.problems) {
  console.log(
    `Lint problems went DOWN: ${baseline.problems} -> ${problems}. ` +
      'Run `node scripts/lint-baseline.mjs --update` to lock the improvement in.'
  );
  process.exit(0);
}

console.log(`Lint problems: ${problems}, unchanged from the baseline.`);
