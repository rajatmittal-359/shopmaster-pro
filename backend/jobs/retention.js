/**
 * Retention (DPDP, 22 Sep 2026): the second half of "Delete my account".
 *
 * WHY
 *   The DPDP Rules 2025 say personal data goes when its purpose is served,
 *   and commerce and tax records are kept - the guidance settles on a year
 *   after the account closes (orders, invoices, payouts). deleteMe removes
 *   what is the person's alone the same minute; the order records, and the
 *   addresses printed on their invoices, wait here for the year to pass.
 *
 * WHAT
 *   Every account deleted a year ago or more and not yet scrubbed: the
 *   addresses an order points at lose the phone, street and landmark
 *   (city, state and PIN stay - place of supply on a tax record is not a
 *   person); a seller's bank account, IFSC, holder name and PAN are blanked
 *   (payout rows keep their amounts and dates); reviews already read
 *   "Deleted account" through the user. `scrubbedAt` is stamped last.
 *
 * Runs on the daily beat with the bag reminder (controllers/jobsController).
 */
const User = require('../models/User');
const Address = require('../models/Address');
const Seller = require('../models/Seller');

const RETAIN_DAYS = 365;

const scrubDeletedAccounts = async ({ now = new Date(), retainDays = RETAIN_DAYS } = {}) => {
  const before = new Date(now.getTime() - retainDays * 24 * 3600 * 1000);
  const due = await User.find({ deletedAt: { $ne: null, $lte: before }, scrubbedAt: null }).select('_id role').lean();
  let addresses = 0;
  let sellers = 0;
  for (const u of due) {
    const a = await Address.updateMany({ userId: u._id }, { $set: { phoneNumber: '0000000000', street: '-', landmark: '' } });
    addresses += a.modifiedCount || 0;
    if (u.role === 'seller') {
      const s = await Seller.updateMany({ userId: u._id }, { $set: { 'bankDetails.accountNumber': '', 'bankDetails.ifscCode': '', 'bankDetails.accountHolderName': '', 'bankDetails.bankName': '', 'application.pan': '' } });
      sellers += s.modifiedCount || 0;
    }
    await User.updateOne({ _id: u._id }, { $set: { scrubbedAt: now } });
  }
  return { accounts: due.length, addresses, sellers, before };
};

module.exports = { scrubDeletedAccounts, RETAIN_DAYS };
