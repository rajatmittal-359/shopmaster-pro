const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Payout = require('../models/Payout');
const { sendError } = require('../utils/apiError');
const { scoreListing } = require('../utils/listingScore');
const { computePerformance } = require('../utils/performance');
const { withShop } = require('../utils/shopNames');

/**
 * The pages the 13 Sep sidebar research said every marketplace panel has and
 * ours lacked: for the seller - Returns & issues, Promotions, Performance,
 * and the counts that badge the sidebar; for the admin - Products across
 * every seller, Customers, and its counts. Reads mostly; the two writes
 * (seller coupons, customer block) are small and guarded.
 */

// ----------------------------------------------------------------- helpers
const actionable = { $or: [{ paymentMethod: { $ne: 'razorpay' } }, { paymentStatus: { $ne: 'pending' } }] };

const sellerOrders = (sellerId, extra = {}) =>
  Order.find({ 'items.sellerId': sellerId, ...actionable, ...extra })
    .populate('customerId', 'name')
    .populate('items.productId', 'images')
    .sort({ updatedAt: -1 })
    .lean();

const mineOf = (order, sellerId) => (order.fulfilments || []).find((f) => String(f.sellerId) === String(sellerId));

const slim = (o, sellerId) => {
  const f = mineOf(o, sellerId) || {};
  const items = (o.items || []).filter((i) => String(i.sellerId) === String(sellerId));
  return {
    _id: o._id,
    orderNumber: o.orderNumber,
    customer: o.customerId?.name || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, image: i.productId?.images?.[0] || null })),
    status: f.status || o.status,
    returnStage: f.returnStage || null,
    returnReason: f.returnReason || null,
    returnResolution: f.returnResolution || null,
    returnRequestedAt: f.returnRequestedAt || null,
    replacementStage: f.replacementStage || null,
    disputeStatus: f.disputeStatus || null,
    disputeReason: f.disputeReason || null,
    disputeRaisedAt: f.disputeRaisedAt || null,
    ndrReason: f.ndrReason || null,
    ndrAttempts: f.ndrAttempts || 0,
    ndrAt: f.ndrAt || null,
    nprReason: f.nprReason || null,
    expectedDeliveryAt: f.expectedDeliveryAt || null,
  };
};

// ----------------------------------------------------------- seller: issues
/**
 * Returns & issues: three queues from the seller's own parcels. Meesho and
 * Flipkart keep these out of Orders because each needs a different action.
 */
exports.sellerIssues = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const orders = await sellerOrders(sellerId);
    const rows = orders.map((o) => slim(o, sellerId));
    const returns = rows.filter((r) => r.returnStage && r.returnStage !== 'rejected');
    const disputes = rows.filter((r) => r.disputeStatus);
    const delivery = rows.filter((r) => (r.ndrAttempts > 0 || r.nprReason) && !['delivered', 'cancelled', 'returned'].includes(r.status));
    res.json({
      returns,
      disputes,
      delivery,
      counts: {
        returns: returns.filter((r) => ['requested', 'picked', 'received'].includes(r.returnStage) && r.replacementStage !== 'delivered').length,
        disputes: disputes.filter((r) => r.disputeStatus === 'open').length,
        delivery: delivery.length,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

// ------------------------------------------------------ seller: promotions
const couponView = (c) => ({
  _id: c._id,
  code: c.code,
  description: c.description,
  type: c.type,
  value: c.value,
  maxDiscount: c.maxDiscount,
  minOrderValue: c.minOrderValue,
  validFrom: c.validFrom,
  validUntil: c.validUntil,
  usageLimit: c.usageLimit,
  perCustomerLimit: c.perCustomerLimit,
  usedCount: c.usedCount,
  isActive: c.isActive,
  expired: Boolean(c.validUntil && new Date(c.validUntil) < new Date()),
});

exports.sellerCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({ fundedBy: 'seller', sellerId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ coupons: coupons.map(couponView) });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * A seller-funded coupon: the discount comes off their own lines only
 * (utils/applyCoupon), so the platform never pays for a seller's sale. The
 * code is theirs to choose; it must be unique across the site.
 */
exports.createSellerCoupon = async (req, res) => {
  try {
    const { code, description, type, value, maxDiscount, minOrderValue, validFrom, validUntil, usageLimit, perCustomerLimit } = req.body || {};
    if (!code || !type || value == null) return res.status(400).json({ message: 'Code, type and value are required' });
    if (type === 'percent' && (Number(value) < 1 || Number(value) > 90)) return res.status(400).json({ message: 'A percentage between 1 and 90' });
    if (type === 'flat' && Number(value) < 1) return res.status(400).json({ message: 'A rupee amount of at least 1' });
    const coupon = await Coupon.create({
      code: String(code).toUpperCase().trim(),
      description: description || null,
      type,
      value: Number(value),
      maxDiscount: maxDiscount ? Number(maxDiscount) : null,
      minOrderValue: minOrderValue ? Number(minOrderValue) : 0,
      fundedBy: 'seller',
      sellerId: req.user._id,
      validFrom: validFrom || Date.now(),
      validUntil: validUntil || null,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      perCustomerLimit: perCustomerLimit ? Number(perCustomerLimit) : 1,
    });
    res.status(201).json({ coupon: couponView(coupon) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'That code is already in use - choose another' });
    if (error.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors)[0]?.message || 'Check the coupon' });
    sendError(res, error);
  }
};

exports.toggleSellerCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ _id: req.params.couponId, fundedBy: 'seller', sellerId: req.user._id });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ coupon: couponView(coupon) });
  } catch (error) {
    sendError(res, error);
  }
};

// ----------------------------------------------------- seller: performance
exports.sellerPerformance = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const since = new Date(Date.now() - 30 * 86400000);
    const [orders, products] = await Promise.all([
      Order.find({ 'items.sellerId': sellerId, createdAt: { $gte: since } }).select('fulfilments createdAt cancelledBy paymentMethod paymentStatus').lean(),
      Product.find({ sellerId, isActive: true, isDeleted: { $ne: true } }).populate('category', 'name').lean(),
    ]);
    const scored = products.map((p) => ({ ...p, score: scoreListing({ ...p, category: p.category?._id || p.category }).score }));
    res.json(computePerformance({ orders, sellerId, products: scored }));
  } catch (error) {
    sendError(res, error);
  }
};

// ---------------------------------------------------- seller: nav counts
/** The badges on the sidebar: what is waiting, in one cheap call. */
exports.sellerNavCounts = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const orders = await Order.find({ 'items.sellerId': sellerId, ...actionable, status: { $in: ['pending', 'processing', 'shipped', 'delivered'] } })
      .select('fulfilments')
      .lean();
    let toPack = 0;
    let returns = 0;
    let disputes = 0;
    let delivery = 0;
    for (const o of orders) {
      const f = mineOf(o, sellerId);
      if (!f) continue;
      if (['pending', 'processing'].includes(f.status) && !f.awb) toPack += 1;
      if (['requested', 'picked', 'received'].includes(f.returnStage) && f.replacementStage !== 'delivered') returns += 1;
      if (f.disputeStatus === 'open') disputes += 1;
      if ((f.ndrAttempts > 0 || f.nprReason) && f.status === 'shipped') delivery += 1;
    }
    res.set('Cache-Control', 'private, max-age=30');
    res.json({ orders: toPack, issues: returns + disputes + delivery, returns, disputes, delivery });
  } catch (error) {
    sendError(res, error);
  }
};

// --------------------------------------------------------- admin: products
/**
 * Every seller's catalogue in one list - the marketplace's own QA view.
 * Listing score is computed here so the admin sees the same number the
 * seller's panel shows.
 */
exports.adminProducts = async (req, res) => {
  try {
    const products = await Product.find({ isDeleted: { $ne: true } })
      .select('name slug price stock isActive images description category color gender ageGroup brand weight tags sellerId createdAt updatedAt avgRating totalReviews')
      .populate('category', 'name')
      .sort({ updatedAt: -1 })
      .lean();
    const named = await withShop(products);
    const rows = named.map((p) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      stock: p.stock,
      isActive: p.isActive,
      image: p.images?.[0] || null,
      category: p.category?.name || null,
      shop: p.shop?.name || null,
      sellerId: p.sellerId,
      score: scoreListing({ ...p, category: p.category?._id || p.category }).score,
      avgRating: p.avgRating || 0,
      totalReviews: p.totalReviews || 0,
      updatedAt: p.updatedAt,
    }));
    res.json({
      products: rows,
      summary: {
        total: rows.length,
        weak: rows.filter((r) => r.score < 60).length,
        outOfStock: rows.filter((r) => r.stock === 0).length,
        hidden: rows.filter((r) => !r.isActive).length,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

// -------------------------------------------------------- admin: customers
exports.adminCustomers = async (req, res) => {
  try {
    const users = await User.find({ role: 'customer' }).select('name email createdAt isVerified isBlocked lastLoginAt').sort({ createdAt: -1 }).lean();
    const stats = await Order.aggregate([
      { $match: actionable },
      {
        $group: {
          _id: '$customerId',
          orders: { $sum: 1 },
          spend: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$cancelledBy', 'customer'] }, 1, 0] } },
          codPending: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentMethod', 'cod'] }, { $eq: ['$status', 'cancelled'] }] }, 1, 0] } },
          disputes: { $sum: { $size: { $filter: { input: { $ifNull: ['$fulfilments', []] }, as: 'f', cond: { $in: [{ $ifNull: ['$$f.disputeStatus', ''] }, ['open', 'resolved_customer', 'resolved_seller']] } } } } },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
    ]);
    const byId = new Map(stats.map((s) => [String(s._id), s]));
    const rows = users.map((u) => {
      const s = byId.get(String(u._id)) || {};
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        joinedAt: u.createdAt,
        verified: Boolean(u.isVerified),
        blocked: Boolean(u.isBlocked),
        orders: s.orders || 0,
        spend: Math.round(s.spend || 0),
        cancelled: s.cancelled || 0,
        codCancelled: s.codPending || 0,
        disputes: s.disputes || 0,
        lastOrderAt: s.lastOrderAt || null,
        // The fraud line, plain: a customer who cancels or disputes more than they keeps.
        flag: (s.cancelled || 0) >= 3 || (s.disputes || 0) >= 2 || ((s.orders || 0) >= 3 && (s.cancelled || 0) / s.orders > 0.5),
      };
    });
    res.json({ customers: rows, summary: { total: rows.length, flagged: rows.filter((r) => r.flag).length, blocked: rows.filter((r) => r.blocked).length } });
  } catch (error) {
    sendError(res, error);
  }
};

/** Block or unblock a customer. Blocked accounts cannot sign in or order; nothing is deleted. */
exports.setCustomerBlocked = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.userId, role: 'customer' });
    if (!user) return res.status(404).json({ message: 'Customer not found' });
    user.isBlocked = Boolean(req.body?.blocked);
    user.blockedReason = user.isBlocked ? String(req.body?.reason || '').slice(0, 300) : null;
    await user.save();
    res.json({ blocked: user.isBlocked });
  } catch (error) {
    sendError(res, error);
  }
};

// -------------------------------------------------------- admin: counts
exports.adminNavCounts = async (req, res) => {
  try {
    const [pendingSellers, disputes, payable] = await Promise.all([
      Seller.countDocuments({ isApproved: { $ne: true }, kycStatus: { $ne: 'rejected' } }),
      Order.countDocuments({ 'fulfilments.disputeStatus': 'open' }),
      Payout.countDocuments({ status: 'pending' }),
    ]);
    res.set('Cache-Control', 'private, max-age=30');
    res.json({ sellers: pendingSellers, orders: disputes, payouts: payable });
  } catch (error) {
    sendError(res, error);
  }
};
