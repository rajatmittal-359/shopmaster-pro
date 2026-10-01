const User = require('../models/User');
/*
 * Through the module objects, not destructured here. Capturing the functions at
 * import time freezes them, and then nothing can stand in for them in a test -
 * the same reason jobsController reaches for `tracking.reconcileOnce()` rather
 * than holding the function.
 */
const payouts = require('../utils/payout');
const notify = require('../utils/notify');

/**
 * Raise a payout for every seller whose money has cleared the return window.
 *
 * WHY A SCHEDULE AND NOT A MEMORY
 *   Amazon settles every seven days, Flipkart on fixed weekdays, Meesho on the
 *   seventh day from delivery. None of them wait for somebody to remember.
 *   Here the ledger already knew who was owed what - it just sat there until an
 *   admin opened the page and pressed a button per seller, and a seller whose
 *   money depends on that is a seller who will ask why it is late.
 *
 * WHAT IT DOES AND, MORE IMPORTANTLY, WHAT IT DOES NOT
 *   It creates the payout. It does NOT move money, because it cannot: Razorpay
 *   Route needs ₹40 lakh of turnover under the RBI's September 2025 Payment
 *   Aggregator rules, and RazorpayX needs a current account. The transfer stays
 *   a human with a banking app, which is why the admin is told it is waiting.
 *
 * WHY CLAIMING EARLY IS SAFE
 *   A payout claims its order lines by stamping `payoutId`, so raising one
 *   before the transfer narrows what else can touch those lines. That is only
 *   acceptable because the undo exists and is clean: marking a payout failed
 *   sets every claimed line's `payoutId` back to null and the money returns to
 *   the payable pool. Without that this job would be a trap.
 *
 * WHAT IT REFUSES
 *   Nothing here re-decides who may be paid - `createPayoutForSeller` already
 *   turns away the platform's own shop, a seller with no bank details, and a
 *   seller with nothing payable, each with the sentence it wants said. This
 *   collects those refusals rather than hiding them: a job that reports
 *   "3 raised, 1 skipped because Nova Electronics has no bank details" is worth
 *   reading; one that says "done" is not.
 */
const raisePayouts = async ({ adminId } = {}) => {
  const admin = adminId || (await User.findOne({ role: 'admin' }).select('_id').lean())?._id;
  // No admin is not an empty week - it is a broken install, and `createdBy` is
  // required on the model. Say so rather than throw a validation error per row.
  if (!admin) return { ok: false, reason: 'No admin account to attribute the payouts to' };

  const rows = await payouts.getPayableSummary();
  const raised = [];
  const skipped = [];

  for (const row of rows) {
    // Sequential on purpose: each call claims order lines, and two of them
    // racing over the same seller is exactly the overlap the claim prevents.
    const result = await payouts.createPayoutForSeller(row.sellerId, admin);
    if (result.ok) {
      raised.push({
        businessName: row.businessName,
        payoutNumber: result.payout.payoutNumber,
        netPayable: result.payout.netPayable,
      });
    } else {
      skipped.push({ businessName: row.businessName, reason: result.reason });
    }
  }

  const total = raised.reduce((n, r) => n + Number(r.netPayable || 0), 0);

  if (raised.length) {
    // The money does not move by itself, so the person who moves it has to be
    // told. One note per run, not one per seller.
    await notify.notifyAdmins({
      category: 'payouts',
      title: `₹${Math.round(total).toLocaleString('en-IN')} ready to transfer`,
      body: `${raised.length} payout${raised.length > 1 ? 's' : ''} raised: ${raised.map((r) => r.businessName).join(', ')}`,
      url: '/admin/payouts',
      tag: `payouts-raised-${new Date().toISOString().slice(0, 10)}`,
    }).catch(() => {});
  }

  return { ok: true, raised, skipped, total };
};

module.exports = { raisePayouts };
