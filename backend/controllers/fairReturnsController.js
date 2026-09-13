const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const RULES = require('../config/sellerRules');
const { sendError } = require('../utils/apiError');
const { uploadEvidence } = require('../utils/evidence');
const { receiptVerdict } = require('../utils/returnPolicy');
const { customerRisk, sellerRisk, goodwillUsedRecently } = require('../utils/risk');
const returns = require('../utils/settleReturn');

/**
 * Fair Returns (plan §4.39) and the decision agent (2.19) - the endpoints.
 *
 * Seller:  pack proof before "Book courier"; the receipt check when a return
 *          comes back (OK → refund; not-OK with photos → dispute for the
 *          admin; not-OK without photos → does not count); the seller's side
 *          of a dispute.
 * Admin:   a customer's computed risk and the consequence they set; approving
 *          a return that waited; the agent's brief on a dispute.
 * Nothing here moves money except through utils/settleReturn, the same road
 * as before. Every consequence carries a reason the other side can read.
 */
const parcelOf = (order, sellerId) => (order.fulfilments || []).find((f) => String(f.sellerId) === String(sellerId));

/** POST /seller/orders/:orderId/pack-proof  { imageDataUrl } */
exports.packProof = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, 'items.sellerId': req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const f = parcelOf(order, req.user._id);
    if (!f || !['pending', 'processing'].includes(f.status)) return res.status(400).json({ message: 'Pack proof is taken before the parcel ships.' });
    const up = await uploadEvidence([req.body?.imageDataUrl], 'shopmaster-pack-proof', { max: 1 });
    if (!up.ok || !up.urls.length) return res.status(400).json({ message: up.message || 'Send one photo of the packed item with its tag.' });
    f.packProof = { url: up.urls[0], publicId: up.publicIds[0] || null, at: new Date() };
    await order.save();
    res.json({ ok: true, packProof: f.packProof, message: 'Pack proof saved. It is your evidence if this parcel is ever disputed.' });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * POST /seller/orders/:orderId/receipt-check  { ok: boolean, photos?: [dataUrl], note? }
 * The item is back. OK pays the refund (receiveReturn). Not-OK needs photos;
 * with them the rulebook decides between goodwill and a dispute for the admin.
 */
exports.receiptCheck = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, 'items.sellerId': req.user._id }).populate('customerId', '_id');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const f = parcelOf(order, req.user._id);
    if (!f || !['requested', 'picked'].includes(f.returnStage)) return res.status(400).json({ message: 'There is no return on its way back here.' });
    const ok = Boolean(req.body?.ok);
    const note = String(req.body?.note || '').trim().slice(0, 500);

    if (ok) {
      f.receiptCheck = { ok: true, photos: [], note: note || null, at: new Date() };
      const done = await returns.receiveReturn(order, { by: 'seller', actorId: req.user._id, sellerId: req.user._id });
      if (!done.ok) return res.status(done.status || 400).json({ message: done.message });
      return res.json({ ok: true, outcome: 'refund', message: done.message });
    }

    const up = await uploadEvidence(req.body?.photos || [], 'shopmaster-returns', { max: 3 });
    if (!up.ok) return res.status(400).json({ message: up.message });
    if (!up.urls.length) return res.status(400).json({ message: `To refuse a return you must add photos of what came back (within ${RULES.receiptCheckHours} hours). Without photos the refund goes through.` });
    if (note.length < 5) return res.status(400).json({ message: 'Say in a line what is wrong with what came back - the customer and the admin read it.' });

    const amount = (order.items || []).filter((i) => String(i.sellerId) === String(req.user._id)).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
    const recent = await goodwillUsedRecently(order.customerId?._id || order.customerId);
    const verdict = receiptVerdict({ sellerOk: false, sellerPhotos: up.urls.length, customerEvidence: (f.returnEvidence || []).length, packProof: Boolean(f.packProof?.url), amount, goodwillUsedRecently: recent });
    f.receiptCheck = { ok: false, photos: up.urls, note, at: new Date() };

    if (verdict.outcome === 'goodwill') {
      f.returnNote = `Refunded as goodwill (under ₹${RULES.goodwillCapRupees}, no pack proof): seller said "${note}"`;
      const done = await returns.receiveReturn(order, { by: 'seller', actorId: req.user._id, sellerId: req.user._id });
      if (!done.ok) return res.status(done.status || 400).json({ message: done.message });
      return res.json({ ok: true, outcome: 'goodwill', message: `Under ₹${RULES.goodwillCapRupees} with no pack proof, the platform refunds this once as goodwill - your photos are kept against this customer's record. Take pack proof next time and a refusal holds.` });
    }

    // A dispute the seller opened: the admin compares pack proof, pickup and both sets of photos.
    f.disputeStatus = 'open';
    f.disputeRaisedBy = 'seller';
    f.disputeReason = `Return came back not as sent: ${note}`;
    f.disputeRaisedAt = new Date();
    f.disputeSellerNote = note;
    f.disputeSellerEvidence = up.urls;
    f.disputeSellerRespondedAt = new Date();
    await order.save();
    res.json({ ok: true, outcome: 'dispute', message: 'Recorded. The refund is on hold and the admin decides from the photos on both sides - usually within 5 days.' });
  } catch (error) {
    sendError(res, error);
  }
};

/** POST /seller/orders/:orderId/dispute/respond  { note, photos?: [dataUrl] } */
exports.disputeRespond = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, 'items.sellerId': req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const f = parcelOf(order, req.user._id);
    if (!f || f.disputeStatus !== 'open') return res.status(400).json({ message: 'There is no open dispute on your parcel.' });
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (note.length < 5) return res.status(400).json({ message: 'Write your side in a few lines - what was sent, when, and what the courier shows.' });
    const up = await uploadEvidence(req.body?.photos || [], 'shopmaster-disputes', { max: 3 });
    if (!up.ok) return res.status(400).json({ message: up.message });
    f.disputeSellerNote = note;
    f.disputeSellerEvidence = [...(f.disputeSellerEvidence || []), ...up.urls].slice(0, 6);
    f.disputeSellerRespondedAt = new Date();
    await order.save();
    res.json({ ok: true, message: 'Your side is on the order. The admin reads both and decides.' });
  } catch (error) {
    sendError(res, error);
  }
};

/** GET /admin/customers/:id/risk */
exports.customerRisk = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const [user, risk] = await Promise.all([User.findById(req.params.id).select('name email risk isBlocked blockedReason').lean(), customerRisk(req.params.id)]);
    if (!user) return res.status(404).json({ message: 'Customer not found' });
    res.json({ user, risk });
  } catch (error) {
    sendError(res, error);
  }
};

/** PATCH /admin/customers/:id/risk  { level, reason } */
exports.setCustomerRisk = async (req, res) => {
  try {
    const level = String(req.body?.level || 'none');
    if (!['none', 'warn', 'prepaid_only', 'returns_approval'].includes(level)) return res.status(400).json({ message: 'level must be none, warn, prepaid_only or returns_approval' });
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (level !== 'none' && reason.length < 5) return res.status(400).json({ message: 'Give the reason - it is shown to the customer.' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Customer not found' });
    user.risk = { level, reason: level === 'none' ? null : reason, setAt: new Date(), setBy: req.user._id };
    await user.save();
    res.json({ ok: true, risk: user.risk });
  } catch (error) {
    sendError(res, error);
  }
};

/** GET /admin/sellers/:userId/risk */
exports.sellerRisk = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ message: 'Invalid id' });
    res.json({ risk: await sellerRisk(req.params.userId) });
  } catch (error) {
    sendError(res, error);
  }
};

/** POST /admin/orders/:orderId/return/approve  { sellerId, approve: boolean, note? } */
exports.approveReturn = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const f = parcelOf(order, req.body?.sellerId);
    if (!f || !f.returnNeedsApproval || f.returnStage !== 'requested') return res.status(400).json({ message: 'No return is waiting for approval on that parcel.' });
    if (req.body?.approve) {
      f.returnNeedsApproval = false;
      f.returnApprovedAt = new Date();
      await order.save();
      setImmediate(() => {
        require('../utils/notifyCustomer').returnDecided(order, true);
        require('../utils/notify').notify({ userId: f.sellerId, role: 'seller', category: 'returns', title: `वापसी मंज़ूर · Return approved · ${order.orderNumber}`, body: 'अब पिकअप बुक करें। Book the pickup from the order page.', url: `/seller/orders/${order._id}`, tag: `return-approved-${order._id}-${f.sellerId}` }).catch(() => {});
      });
      return res.json({ ok: true, message: 'Approved. The seller can book the pickup now.' });
    }
    const done = await returns.rejectReturn(order, { actorId: req.user._id, sellerId: f.sellerId, reason: `Admin: ${String(req.body?.note || 'return not approved').trim()}` });
    if (!done.ok) return res.status(done.status || 400).json({ message: done.message });
    setImmediate(() => require('../utils/notifyCustomer').returnDecided(order, false, req.body?.note));
    res.json({ ok: true, message: 'Return refused; the customer sees the reason and can write to Help.' });
  } catch (error) {
    sendError(res, error);
  }
};

/** GET /admin/orders/:orderId/dispute-brief?sellerId=  (?fresh=1 to redraft) */
exports.disputeBrief = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { sellerId } = req.query;
    if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(sellerId)) return res.status(400).json({ message: 'orderId and sellerId are required' });
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const f = parcelOf(order, sellerId);
    if (!f) return res.status(404).json({ message: 'No parcel for that seller' });
    // A brief drawn in the last hour is reused; the evidence rarely changes faster.
    if (!req.query.fresh && f.disputeBrief?.text && f.disputeBrief.at && Date.now() - new Date(f.disputeBrief.at) < 3600000) {
      const { gatherEvidence } = require('../utils/ai/decisionAgent');
      const full = await Order.findById(orderId).populate('customerId', 'name email').lean();
      return res.json({ brief: JSON.parse(f.disputeBrief.text), evidence: await gatherEvidence(full, sellerId), model: f.disputeBrief.model, at: f.disputeBrief.at, cached: true });
    }
    const { briefDispute } = require('../utils/ai/decisionAgent');
    const r = await briefDispute(orderId, sellerId);
    if (!r.ok) return res.status(503).json({ message: r.reason, evidence: r.evidence || null });
    f.disputeBrief = { text: JSON.stringify(r.brief), recommendation: r.brief.recommendation, confidence: r.brief.confidence, model: r.model, at: new Date() };
    await order.save();
    res.json({ brief: r.brief, evidence: r.evidence, model: r.model, at: f.disputeBrief.at, cached: false });
  } catch (error) {
    sendError(res, error);
  }
};
