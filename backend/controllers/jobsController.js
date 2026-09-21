const crypto = require('crypto');
// Held as module objects rather than destructured. A destructured copy binds
// the real function at require time and can never be replaced, so a test that
// swaps it out is ignored and the "test" calls the live job - which is how
// three of these first hung against a database no test may reach. Same reason
// as utils/cancelOrder.js and utils/settleReturn.js.
const lowStock = require('../jobs/lowStock');
const tracking = require('../jobs/trackingReconcile');
const growthNote = require('../jobs/growthNote');
const catalogueSweep = require('../jobs/catalogueSweep');

/**
 * Scheduled work, triggered from outside.
 *
 * WHY THIS EXISTS
 *   node-cron runs inside the web service, and on Render's free tier that
 *   service sleeps after 15 minutes idle. A sleeping process runs no timers, so
 *   the low-stock alert never went out and the tracking reconciler - the very
 *   thing built to catch webhooks the sleeping service had missed - never ran
 *   either. Nothing errored. The jobs simply did not happen.
 *
 *   So the timetable moves out of the process. GitHub Actions calls these on a
 *   schedule; the call itself wakes the service. This is how hosted schedulers
 *   work, and unlike a keep-alive ping it FAILS LOUDLY - a workflow that cannot
 *   reach this endpoint turns the run red and emails.
 *
 * WHY IT REFUSES WITHOUT A TOKEN RATHER THAN ALLOWING
 *   The classic version of this bug is "if no token is configured, let it
 *   through" - which means a misconfigured deploy is wide open and looks
 *   perfectly healthy. Here, no token configured means nothing can run it.
 */

/** Jobs that may be triggered, and what each one does. */
const JOBS = {
  reconcile: {
    // Called through the module object, not captured here, for the reason above.
    run: () => tracking.reconcileOnce(),
    /*
     * Refuses rather than running with no credentials: every call would be a
     * failed Shiprocket login, and a job that "succeeds" having done nothing is
     * worse than one that says it cannot run.
     */
    requires: 'SHIPROCKET_API_EMAIL',
  },
  'low-stock': { run: () => lowStock.runLowStockAlerts() },
  // Monday's three things for every seller (plan 2.25). No model, no key needed.
  'growth-note': { run: () => growthNote.sendGrowthNotes() },
  // Thursday's catalogue sweep (plan 2.25/2.32): listing facts, three per seller. No model.
  'catalogue-sweep': { run: () => catalogueSweep.sweep() },
  // Every two hours at :45: refunds the gateway would not raise yet (utils/refundQueue). No key beyond Razorpay's.
  refunds: {
    run: async () => {
      // Same two-hourly beat: expired stock holds nobody has come back for (utils/reservation, drill L3).
      const holds = await require('../utils/reservation').releaseAllExpired().catch((e) => ({ error: e.message }));
      const refunds = await require('../utils/refundQueue').retryQueued();
      return { refunds, holds };
    },
    requires: 'RAZORPAY_KEY_SECRET',
  },
  // Daily 04:45 UTC: the bag left behind 20-48 h ago, once a week at most (jobs/cartReminder).
  'cart-reminder': { run: () => require('../jobs/cartReminder').remind() },
  // Monday 03:15 UTC: the weekly market brief per selling category
  // (utils/ai/marketBrief) - Search Console + our search box + Merchant
  // insights + one grounded search each; Ask ShopMaster reads it for free.
  // One-off / occasional: fill product facts on listings that predate the category templates (jobs/backfillListings).
  'backfill-listings': { run: (q = {}) => require('../jobs/backfillListings').backfill({ mode: q.mode === 'rewrite' ? 'rewrite' : 'fill', max: Number(q.max) || 25, deps: { again: q.again === '1' } }), requires: 'GEMINI_API_KEY', detached: true },
  'tidy-tags': { run: () => require('../jobs/backfillListings').tidyTags() },
  'market-brief': { run: () => require('../utils/ai/marketBrief').buildBriefs(), requires: 'GEMINI_API_KEY' },
  /*
   * Plan 2.23: the assistant's fixed exam, kept as an EvalRun for the trend on
   * /admin/ask. Weekly, Sunday night after the re-index - eleven real answers
   * are a visible slice of a free Gemini day. The roads fall back on their
   * own, so no single key is required; a day with every road down grades as
   * FAILED rows, which is itself the finding.
   */
  eval: { run: () => require('../utils/ai/evals').runAndSave() },
  /*
   * Plan 2.17: product embeddings for "You may also like" and semantic
   * top-up (2.21) go stale as sellers edit; this embeds what changed (hash)
   * and keeps the Atlas index. Weekly from GitHub Actions. Needs Gemini for
   * the vectors - refuses plainly without it. The knowledge index is NOT
   * here: it reads the repo's own files, so it runs in Actions with a checkout.
   */
  vectors: {
    run: async () => {
      const { embedProducts } = require('../utils/productVectors');
      const lines = [];
      const r = await embedProducts({ log: (m) => lines.push(String(m)) });
      return { ...(r || {}), log: lines.slice(-20) };
    },
    requires: 'GEMINI_API_KEY',
  },
};

/**
 * Compares in constant time, so the number of correct leading characters cannot
 * be learned from how long the comparison took.
 */
const tokenMatches = (given, expected) => {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

exports.runJob = async (req, res) => {
  const expected = process.env.JOBS_TOKEN;

  /*
   * A short or missing token is a configuration mistake, and the safe reading
   * of a configuration mistake is "closed".
   */
  if (!expected || expected.length < 20) {
    console.error('JOBS: refused - JOBS_TOKEN is not set, or is too short to be a secret');
    return res.status(503).json({
      success: false,
      message: 'Scheduled jobs are not configured on this server',
    });
  }

  if (!tokenMatches(req.get('x-job-token'), expected)) {
    return res.status(401).json({ success: false, message: 'Not authorised' });
  }

  const job = JOBS[req.params.name];
  if (!job) {
    return res.status(404).json({
      success: false,
      message: `Unknown job. Known jobs: ${Object.keys(JOBS).join(', ')}`,
    });
  }

  if (job.requires && !process.env[job.requires]) {
    return res.status(503).json({
      success: false,
      message: `This job needs ${job.requires} to be set`,
    });
  }

  const startedAt = Date.now();
  // A long job (minutes of model calls) answers at once and finishes on its
  // own; the proxy would otherwise cut the request and the caller would never
  // learn how it went. Its result goes to the log, and its effects are visible
  // where it worked (the products, the briefs).
  if (job.detached || req.query.detach === '1') {
    Promise.resolve()
      .then(() => job.run(req.query))
      .then((result) => console.log(`JOB ${req.params.name} finished in ${Date.now() - startedAt}ms -`, JSON.stringify(result)))
      .catch((error) => console.error(`JOB ${req.params.name} FAILED:`, error.message));
    return res.status(202).json({ success: true, job: req.params.name, started: true, note: 'running in the background; the log carries the result' });
  }
  try {
    const result = await job.run(req.query);
    const ms = Date.now() - startedAt;

    // Logged as well as returned: the caller sees it now, the log keeps it.
    console.log(`JOB ${req.params.name} finished in ${ms}ms -`, JSON.stringify(result));

    return res.json({ success: true, job: req.params.name, ms, result });
  } catch (error) {
    console.error(`JOB ${req.params.name} FAILED:`, error.message);
    /*
     * 500 on purpose. The scheduler treats a non-2xx as a failed run and says
     * so - which is the whole reason for scheduling from outside rather than
     * from a timer nobody watches.
     */
    return res.status(500).json({
      success: false,
      job: req.params.name,
      message: error.message,
    });
  }
};

module.exports.JOBS = JOBS;
