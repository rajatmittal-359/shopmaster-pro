const Order = require('../models/Order');

/**
 * Fair Returns (plan §4.39 D): both sides can lie, so both sides have a
 * record. Computed from orders, never stored - a score that is a snapshot
 * of the data cannot go stale or be argued with. The admin reads it, and
 * sets the consequence (User.risk / Seller status) by hand, with a reason.
 */
const DAYS_180 = 180 * 86400000;

const customerRisk = async (customerId) => {
  const since = new Date(Date.now() - DAYS_180);
  const orders = await Order.find({ customerId, createdAt: { $gte: since }, $or: [{ paymentMethod: { $ne: 'razorpay' } }, { paymentStatus: { $ne: 'pending' } }] })
    .select('fulfilments createdAt totalAmount cancelledBy')
    .lean();
  const fs = orders.flatMap((o) => o.fulfilments || []);
  const delivered = fs.filter((f) => f.status === 'delivered' || f.deliveredAt).length;
  const returns = fs.filter((f) => f.returnStage).length;
  const refused = fs.filter((f) => f.returnStage === 'rejected').length;
  const disputes = fs.filter((f) => f.disputeStatus).length;
  const disputesLost = fs.filter((f) => f.disputeStatus === 'resolved_seller' && f.disputeRaisedBy !== 'seller').length;
  const disputesWon = fs.filter((f) => f.disputeStatus === 'resolved_customer').length;
  const rto = fs.filter((f) => (f.ndrAttempts || 0) >= 2 || (f.status === 'returned' && !f.returnStage)).length;
  const emptyBox = fs.filter((f) => f.returnKind === 'wrong' || /empty|khaali|nothing came|nahi mila/i.test(f.disputeReason || '')).length;
  const goodwill = fs.filter((f) => /goodwill/i.test(f.returnNote || '')).length;
  const returnRate = delivered ? Math.round((returns / delivered) * 100) : 0;
  const signals = [];
  if (delivered >= 3 && returnRate >= 40) signals.push(`returns ${returnRate}% of delivered parcels`);
  if (refused >= 2) signals.push(`${refused} returns refused by sellers`);
  if (disputesLost >= 2) signals.push(`${disputesLost} disputes lost`);
  if (rto >= 2) signals.push(`${rto} parcels came back undelivered`);
  if (emptyBox >= 2) signals.push(`${emptyBox} wrong/empty-box claims`);
  const level = signals.length >= 3 ? 'high' : signals.length >= 1 ? 'watch' : 'clean';
  return { windowDays: 180, orders: orders.length, delivered, returns, returnRate, refused, disputes, disputesLost, disputesWon, rto, emptyBox, goodwill, signals, level };
};

const sellerRisk = async (sellerId) => {
  const since = new Date(Date.now() - DAYS_180);
  const orders = await Order.find({ 'items.sellerId': sellerId, createdAt: { $gte: since } }).select('fulfilments').lean();
  const fs = orders.flatMap((o) => (o.fulfilments || []).filter((f) => String(f.sellerId) === String(sellerId)));
  const shipped = fs.filter((f) => f.shippedAt || ['shipped', 'delivered'].includes(f.status));
  const withProof = shipped.filter((f) => f.packProof?.url).length;
  const disputes = fs.filter((f) => f.disputeStatus).length;
  const disputesLost = fs.filter((f) => f.disputeStatus === 'resolved_customer').length;
  const notAsDescribed = fs.filter((f) => f.returnKind === 'not_as_described').length;
  const refusals = fs.filter((f) => f.receiptCheck?.ok === false).length;
  const refusalsOverturned = fs.filter((f) => f.receiptCheck?.ok === false && f.disputeStatus === 'resolved_customer').length;
  const packProofRate = shipped.length ? Math.round((withProof / shipped.length) * 100) : null;
  const signals = [];
  if (disputes >= 3 && disputesLost / disputes >= 0.5) signals.push(`lost ${disputesLost} of ${disputes} disputes`);
  if (notAsDescribed >= 2) signals.push(`${notAsDescribed} "not as described" returns`);
  if (refusalsOverturned >= 2) signals.push(`${refusalsOverturned} return refusals overturned by the admin`);
  if (shipped.length >= 5 && packProofRate < 50) signals.push(`pack proof on only ${packProofRate}% of parcels`);
  const level = signals.length >= 2 ? 'high' : signals.length === 1 ? 'watch' : 'clean';
  return { windowDays: 180, shipped: shipped.length, packProofRate, disputes, disputesLost, notAsDescribed, refusals, refusalsOverturned, signals, level };
};

/** Did this customer already get a goodwill refund in the last 90 days? */
const goodwillUsedRecently = async (customerId) => {
  const since = new Date(Date.now() - 90 * 86400000);
  const n = await Order.countDocuments({ customerId, updatedAt: { $gte: since }, 'fulfilments.returnNote': /goodwill/i });
  return n > 0;
};

module.exports = { customerRisk, sellerRisk, goodwillUsedRecently };
