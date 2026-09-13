const mongoose = require('mongoose');
const Review = require('../models/Review');
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendError } = require('../utils/apiError');
const { sellerRisk } = require('../utils/risk');

/**
 * The Trust queue (plan 2.22) - one admin list of everything the moderator
 * or the rulebook held for a person:
 *
 *   held reviews          contact details, abuse, spam in a review
 *   held Abouts           a seller's About with a phone number or a link
 *   held returns          Fair Returns: big amounts, customers under approval
 *   flagged disputes      open disputes whose text the moderator marked
 *   restricted customers  the risk levels an admin set, with reasons
 *   sellers to watch      sellers whose 180-day record shows a signal
 *
 * Built for the weekend admin: everything here has a button, and nothing
 * here needs a second page to understand. Reference: Shopify's fraud
 * analysis card and Etsy's "cases" queue - the item, the reason, the button.
 */
exports.queue = async (req, res) => {
  try {
    const [heldReviews, heldAbouts, heldReturns, flaggedDisputes, restricted, sellers] = await Promise.all([
      Review.find({ 'moderation.status': 'held' }).populate('userId', 'name email').populate('productId', 'name slug').sort({ createdAt: -1 }).limit(50).lean(),
      Seller.find({ 'aboutModeration.status': 'held' }).select('businessName about aboutModeration userId').lean(),
      Order.find({ fulfilments: { $elemMatch: { returnNeedsApproval: true, returnApprovedAt: null, returnStage: 'requested' } } }).populate('customerId', 'name email').select('orderNumber customerId items fulfilments totalAmount createdAt').limit(50).lean(),
      Order.find({ fulfilments: { $elemMatch: { disputeStatus: 'open', textFlags: { $exists: true, $ne: [] } } } }).populate('customerId', 'name email').select('orderNumber customerId fulfilments createdAt').limit(50).lean(),
      User.find({ 'risk.level': { $in: ['warn', 'prepaid_only', 'returns_approval'] } }).select('name email risk').sort({ 'risk.setAt': -1 }).limit(50).lean(),
      Seller.find({ status: 'active' }).select('businessName userId').limit(40).lean(),
    ]);
    const watch = [];
    for (const s of sellers) {
      const r = await sellerRisk(s.userId);
      if (r.level !== 'clean') watch.push({ sellerId: s.userId, businessName: s.businessName, ...r });
    }
    res.json({
      heldReviews: heldReviews.map((r) => ({ _id: r._id, rating: r.rating, title: r.title, comment: r.comment, moderation: r.moderation, customer: r.userId, product: r.productId, createdAt: r.createdAt })),
      heldAbouts: heldAbouts.map((s) => ({ sellerUserId: s.userId, businessName: s.businessName, about: s.about, moderation: s.aboutModeration })),
      heldReturns: heldReturns.flatMap((o) => (o.fulfilments || []).filter((f) => f.returnNeedsApproval && !f.returnApprovedAt && f.returnStage === 'requested').map((f) => ({ orderId: o._id, orderNumber: o.orderNumber, customer: o.customerId, sellerId: f.sellerId, kind: f.returnKind, reason: f.returnReason, evidence: f.returnEvidence || [], tagIntact: f.returnTagIntact, amount: (o.items || []).filter((i) => String(i.sellerId) === String(f.sellerId)).reduce((s, i) => s + i.price * i.quantity, 0), requestedAt: f.returnRequestedAt }))),
      flaggedDisputes: flaggedDisputes.flatMap((o) => (o.fulfilments || []).filter((f) => f.disputeStatus === 'open' && f.textFlags?.length).map((f) => ({ orderId: o._id, orderNumber: o.orderNumber, customer: o.customerId, sellerId: f.sellerId, reason: f.disputeReason, flags: f.textFlags, raisedAt: f.disputeRaisedAt }))),
      restricted,
      watch,
    });
  } catch (error) {
    sendError(res, error);
  }
};

/** PATCH /admin/trust/reviews/:id  { action: 'approve'|'remove' } */
exports.reviewAction = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const action = req.body?.action;
    if (!['approve', 'remove'].includes(action)) return res.status(400).json({ message: 'action must be approve or remove' });
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    review.moderation = { ...(review.moderation?.toObject?.() || review.moderation || {}), status: action === 'approve' ? 'ok' : 'removed', at: new Date(), by: 'admin' };
    await review.save();
    await Review.recalculateProductRating(review.productId);
    res.json({ ok: true, status: review.moderation.status });
  } catch (error) {
    sendError(res, error);
  }
};

/** PATCH /admin/trust/sellers/:userId/about  { action: 'approve'|'remove' } */
exports.aboutAction = async (req, res) => {
  try {
    const action = req.body?.action;
    if (!['approve', 'remove'].includes(action)) return res.status(400).json({ message: 'action must be approve or remove' });
    const seller = await Seller.findOne({ userId: req.params.userId });
    if (!seller) return res.status(404).json({ message: 'Seller not found' });
    if (action === 'remove') seller.about = '';
    seller.aboutModeration = { status: action === 'approve' ? 'ok' : 'removed', categories: seller.aboutModeration?.categories || [], reason: seller.aboutModeration?.reason || null, at: new Date() };
    await seller.save();
    res.json({ ok: true, status: seller.aboutModeration.status });
  } catch (error) {
    sendError(res, error);
  }
};
