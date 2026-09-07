const crypto = require('crypto');
// Held as module objects rather than destructured. A destructured copy binds
// the real function at require time and can never be replaced, so a test that
// swaps it out is ignored and the "test" calls the live job - which is how
// three of these first hung against a database no test may reach. Same reason
// as utils/cancelOrder.js and utils/settleReturn.js.
const lowStock = require('../jobs/lowStock');
const tracking = require('../jobs/trackingReconcile');

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
  try {
    const result = await job.run();
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
