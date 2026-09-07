const Product = require('../models/Product');
const sendEmail = require('../utils/sendEmail');
const { lowStockEmail } = require('../utils/emailTemplates');

/**
 * Tell each seller which of their products are running out.
 *
 * WHY IT IS A FUNCTION AND NOT A CRON CALLBACK ANY MORE
 *   It used to live inside cron.schedule() in cronJobs.js, which meant the only
 *   way to run it was to wait for 9am and hope the process was awake. On
 *   Render's free tier the web service sleeps after 15 minutes, node-cron
 *   sleeps with it, and the alert simply never went out - silently, with
 *   nothing anywhere saying so.
 *
 *   Pulled out here so both the in-process schedule AND the endpoint an
 *   external scheduler calls run the SAME code. Two copies of "who is low on
 *   stock" would be two answers eventually.
 *
 * WHY IT REPORTS RATHER THAN LOGS
 *   A caller that cannot see what happened cannot tell a working job from a
 *   broken one. The counts go back to whoever asked.
 */
const runLowStockAlerts = async () => {
  const lowStock = await Product.find({
    isActive: true,
    isDeleted: { $ne: true },
    $expr: { $lte: ['$stock', '$lowStockThreshold'] },
  }).populate('sellerId');

  /*
   * Product.sellerId references User, so the populated value IS the seller's
   * user account. This once read `.userId` off it as though it were a Seller
   * profile - always undefined, so every alert was silently skipped. Group by
   * the user directly.
   */
  const bySeller = new Map();

  for (const p of lowStock) {
    if (!p.sellerId) continue; // a product whose owner was deleted
    const id = String(p.sellerId._id);
    if (!bySeller.has(id)) bySeller.set(id, { user: p.sellerId, products: [] });
    bySeller.get(id).products.push(p);
  }

  let sent = 0;
  let failed = 0;

  for (const { user, products } of bySeller.values()) {
    if (!user.email) continue;
    try {
      await sendEmail({ to: user.email, ...lowStockEmail(products, user) });
      sent += 1;
    } catch (err) {
      /*
       * One seller's mail bouncing must not stop the rest. Counted rather than
       * thrown, so the caller sees "3 sent, 1 failed" instead of an exception
       * that hides the three that worked.
       */
      failed += 1;
      console.error('Low stock email failed for', user.email, '-', err.message);
    }
  }

  return { products: lowStock.length, sellers: bySeller.size, sent, failed };
};

module.exports = { runLowStockAlerts };
