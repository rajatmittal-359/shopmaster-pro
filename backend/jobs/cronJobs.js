const cron = require('node-cron');
const { runLowStockAlerts } = require('./lowStock');
const { reconcileOnce } = require('./trackingReconcile');

/**
 * Scheduled work, when this process is the one doing the scheduling.
 *
 * WHY THERE IS A SWITCH
 *   node-cron lives inside the web service. On Render's free tier that service
 *   sleeps after 15 minutes without traffic, and a sleeping process runs no
 *   timers - so the low-stock alert never went out and the tracking reconciler
 *   never ran. Nothing failed loudly; the jobs simply did not happen, which is
 *   the worst way for a safety net to be missing.
 *
 *   The fix is to schedule from OUTSIDE: GitHub Actions calls
 *   POST /api/jobs/:name on a timetable (see .github/workflows). That is an
 *   ordinary architecture, not a workaround - it is what Vercel Cron and every
 *   hosted scheduler does.
 *
 *   But TWO schedulers is worse than one. The low-stock job is not idempotent:
 *   run it twice and every seller gets two emails. So when an external
 *   scheduler is driving, this one stands down entirely.
 *
 *     USE_EXTERNAL_CRON=true   -> GitHub Actions drives; this does nothing
 *     unset                    -> this process schedules, as before
 */
exports.startCronJobs = () => {
  if (String(process.env.USE_EXTERNAL_CRON).toLowerCase() === 'true') {
    console.log('⏰ In-process cron is OFF - an external scheduler is driving');
    return;
  }

  // Daily at 9 AM - low stock alert.
  cron.schedule('0 9 * * *', async () => {
    try {
      const result = await runLowStockAlerts();
      console.log(
        `✅ Low stock: ${result.sent} seller(s) told about ${result.products} product(s)` +
          (result.failed ? `, ${result.failed} email(s) failed` : '')
      );
    } catch (err) {
      console.error('❌ Low stock cron failed:', err.message);
    }
  });

  /*
   * Every two hours: ask the courier about parcels the webhook has gone quiet
   * on.
   *
   * Not daily. deliveredAt starts a 7-day return window and the window closing
   * is what pays a seller, so a day's delay is a day's delay in somebody's
   * money. Not every few minutes either - it is a safety net, and the webhook
   * is the fast path.
   *
   * SHIPROCKET_API_EMAIL gates it because without credentials every call is a
   * failed login, which is noise in the log and nothing else.
   */
  if (process.env.SHIPROCKET_API_EMAIL) {
    cron.schedule('15 */2 * * *', async () => {
      try {
        const { asked, moved, scanned } = await reconcileOnce();
        if (asked) {
          console.log(
            `📦 Tracking reconcile: ${scanned} order(s), ${asked} asked, ${moved} moved`
          );
        }
      } catch (err) {
        console.error('❌ Tracking reconcile failed:', err.message);
      }
    });
    console.log('📦 Tracking reconcile scheduled');
  } else {
    console.warn('⚠️  Tracking reconcile off: SHIPROCKET_API_EMAIL is not set');
  }

  console.log('📧 Cron jobs started');
};
