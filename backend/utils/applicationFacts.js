const { customerRisk } = require('./risk');

/**
 * The seller-application brief (plan 2.19, 15 Sep 2026) - facts, not a model.
 *
 * An application carries a business name and an accepted agreement, and
 * that is all; there is nothing for a language model to weigh. What the
 * admin actually wants before pressing Approve is what Amazon's account
 * verification and Shopify's partner review both show: is this a real,
 * reachable shop that has filled itself in? So: is the email verified, how
 * old is the account, has the pickup address been given (and is it in
 * Jaipur - the same-city trust story), a bank account for payouts, a GST
 * number, a shop story and its profiles, and has this person bought here
 * before (a buyer with a clean 180-day record is a known quantity; one on
 * the risk list is not). Each is a line the page can draw as a tick or a
 * dash. Never a verdict: the admin decides.
 */
const JAIPUR_PIN = /^30[23]/;

const applicationFacts = async (seller) => {
  const user = seller.userId && typeof seller.userId === 'object' ? seller.userId : {};
  const pin = String(seller.pickupAddress?.pincode || '');
  const links = Object.values(seller.links || {}).filter(Boolean).length;
  let buyer = null;
  try {
    const userId = user._id || seller.userId;
    if (userId) {
      const r = await customerRisk(userId);
      buyer = { orders: r.orders, level: r.level, signals: r.signals };
    }
  } catch {
    buyer = null;
  }
  const days = user.createdAt ? Math.floor((Date.now() - new Date(user.createdAt)) / 86400000) : null;
  return {
    appliedAt: seller.createdAt || null,
    accountAgeDays: days,
    emailVerified: Boolean(user.isVerified),
    pickup: seller.pickupAddress?.city ? `${seller.pickupAddress.city}${seller.pickupAddress.state ? `, ${seller.pickupAddress.state}` : ''}${pin ? ` ${pin}` : ''}` : null,
    inJaipur: JAIPUR_PIN.test(pin),
    bank: Boolean(seller.bankDetails?.accountNumber),
    gst: Boolean(seller.gstNumber),
    aboutWords: String(seller.about || '').trim().split(/\s+/).filter(Boolean).length,
    links,
    buyer,
  };
};

module.exports = { applicationFacts };
