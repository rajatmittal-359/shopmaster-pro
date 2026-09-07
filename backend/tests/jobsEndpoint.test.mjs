/**
 * The endpoint an outside scheduler calls to run the cron work.
 *
 * WHY IT EXISTS AT ALL
 *   node-cron runs inside the Express process, and on Render's free tier that
 *   process sleeps after 15 minutes idle. A sleeping process runs no timers, so
 *   the low-stock alert never went out and the tracking reconciler - built
 *   precisely to catch webhooks a sleeping service had missed - never ran.
 *   Nothing errored; the jobs just did not happen.
 *
 * WHY THE AUTH SHAPE MATTERS MORE THAN THE JOBS
 *   This is an unauthenticated-by-default URL that sends email and calls a paid
 *   courier API. The classic way to get this wrong is "if no token is
 *   configured, allow it" - which leaves a misconfigured deploy wide open while
 *   looking perfectly healthy.
 *
 * The rules being defended:
 *   1. no token configured => nothing runs, ever
 *   2. wrong token => 401, and the job does not run
 *   3. right token => the job runs and reports what it did
 *   4. an unknown job name is refused rather than silently doing nothing
 *   5. a job that throws returns 500, so the scheduler shows a failed run
 *   6. the token is compared in constant time
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';

const require = createRequire(import.meta.url);

const app = require('../app');
const lowStock = require('../jobs/lowStock');
const reconcile = require('../jobs/trackingReconcile');

const GOOD = 'a-token-long-enough-to-be-a-real-secret';

const originals = {};

beforeEach(() => {
  originals.token = process.env.JOBS_TOKEN;
  originals.shiprocket = process.env.SHIPROCKET_API_EMAIL;
  originals.runLowStockAlerts = lowStock.runLowStockAlerts;
  originals.reconcileOnce = reconcile.reconcileOnce;

  process.env.JOBS_TOKEN = GOOD;
  process.env.SHIPROCKET_API_EMAIL = 'ops@example.com';
});

afterEach(() => {
  if (originals.token === undefined) delete process.env.JOBS_TOKEN;
  else process.env.JOBS_TOKEN = originals.token;

  if (originals.shiprocket === undefined) delete process.env.SHIPROCKET_API_EMAIL;
  else process.env.SHIPROCKET_API_EMAIL = originals.shiprocket;

  lowStock.runLowStockAlerts = originals.runLowStockAlerts;
  reconcile.reconcileOnce = originals.reconcileOnce;
});

const post = (job, token) => {
  const r = request(app).post(`/api/jobs/${job}`);
  return token === undefined ? r : r.set('x-job-token', token);
};

describe('who is allowed to run a job', () => {
  it('refuses everybody when no token is configured', async () => {
    delete process.env.JOBS_TOKEN;
    const ran = vi.fn();
    reconcile.reconcileOnce = ran;

    const res = await post('reconcile', GOOD);

    // "No token set" must mean CLOSED. The opposite reading - allow it through
    // because nothing was configured - is how a misconfigured deploy ends up
    // open to the internet while looking perfectly healthy.
    expect(res.status).toBe(503);
    expect(ran).not.toHaveBeenCalled();
  });

  it('refuses a token too short to be a secret', async () => {
    process.env.JOBS_TOKEN = 'short';
    const ran = vi.fn();
    reconcile.reconcileOnce = ran;

    const res = await post('reconcile', 'short');

    expect(res.status).toBe(503);
    expect(ran).not.toHaveBeenCalled();
  });

  it('refuses a request with no token at all', async () => {
    const ran = vi.fn();
    reconcile.reconcileOnce = ran;

    const res = await post('reconcile', undefined);

    expect(res.status).toBe(401);
    expect(ran).not.toHaveBeenCalled();
  });

  it('refuses the wrong token', async () => {
    const ran = vi.fn();
    reconcile.reconcileOnce = ran;

    const res = await post('reconcile', 'a-token-long-enough-to-be-WRONG!!!!!!');

    expect(res.status).toBe(401);
    expect(ran).not.toHaveBeenCalled();
  });

  it('is not fooled by a token that merely starts correctly', async () => {
    const ran = vi.fn();
    reconcile.reconcileOnce = ran;

    const res = await post('reconcile', GOOD.slice(0, -1));

    expect(res.status).toBe(401);
    expect(ran).not.toHaveBeenCalled();
  });
});

describe('running a job', () => {
  it('runs the reconciler and reports what it found', async () => {
    reconcile.reconcileOnce = vi.fn(async () => ({ scanned: 4, asked: 2, moved: 1 }));

    const res = await post('reconcile', GOOD);

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ scanned: 4, asked: 2, moved: 1 });
    // A caller that cannot see what happened cannot tell a working job from a
    // broken one.
    expect(res.body.ms).toBeGreaterThanOrEqual(0);
  });

  it('runs the low-stock alert', async () => {
    lowStock.runLowStockAlerts = vi.fn(async () => ({
      products: 3,
      sellers: 1,
      sent: 1,
      failed: 0,
    }));

    const res = await post('low-stock', GOOD);

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ sent: 1 });
  });

  it('refuses a job name it does not know, rather than doing nothing quietly', async () => {
    const res = await post('delete-everything', GOOD);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/reconcile/);
  });

  it('will not run the reconciler with no courier credentials', async () => {
    delete process.env.SHIPROCKET_API_EMAIL;
    const ran = vi.fn();
    reconcile.reconcileOnce = ran;

    const res = await post('reconcile', GOOD);

    // Every call would be a failed Shiprocket login. A job that "succeeds"
    // having done nothing is worse than one that says it cannot run.
    expect(res.status).toBe(503);
    expect(ran).not.toHaveBeenCalled();
  });

  it('answers 500 when the job throws, so the scheduler shows a failed run', async () => {
    reconcile.reconcileOnce = vi.fn(async () => {
      throw new Error('Shiprocket wallet is empty');
    });

    const res = await post('reconcile', GOOD);

    // The whole point of scheduling from outside is that a broken job becomes
    // an email instead of a silence.
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/wallet/i);
  });
});
