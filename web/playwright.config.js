// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Five smoke tests over the real app (22 Sep 2026): the paths a deploy must
 * not break - the storefront renders, search answers, a product can reach the
 * checkout, the seller panel opens, the admin panel opens. Not a UI test
 * suite: the testing pyramid puts 5-10 e2e tests over critical paths on top
 * of 1,200 unit tests, and that is what this is.
 *
 * Runs against a LIVE local stack: the API on :5000 with a seeded database,
 * the built web on :3000. In CI `.github/workflows/tests.yml` brings both up
 * (Mongo service, `seed.js --minimal`, `next start`); on the laptop start
 * them yourself (`npm run server`, `npm run web` from the repo root) and run
 * `npx playwright test` in web/.
 *
 * Credentials come from env (SEED_DEMO_PASSWORD, SEED_*_EMAIL) - the same
 * values the seed used. Nothing is hard-coded, nothing private is committed.
 */
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 390, height: 844 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
});
