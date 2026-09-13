const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Payout = require('../../models/Payout');
const Seller = require('../../models/Seller');
const SellerCharge = require('../../models/SellerCharge');
const Category = require('../../models/Category');
const { sellerPayoutStateFor, getPayableSummary } = require('../payout');
const { scoreListing } = require('../listingScore');
const { computePerformance } = require('../performance');
const { retrieve } = require('./retrieve');

/**
 * What the assistant may look up, by role. Read-only, every one of them.
 *
 * A tool is a question the model can ask the database on the asker's
 * behalf; the asker's identity comes from the session, never from the
 * model's arguments - `getOrder` for a seller returns that seller's lines
 * of the order and nothing else, whatever number the model passes. The
 * `roles` list is the second wall: a customer's model never even hears
 * that `platformSummary` exists.
 *
 * Results are plain sentences and small objects, not documents: the model
 * quotes them, and a document dump would drag ids and internals into an
 * answer for a shopkeeper.
 */
const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const when = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
const ORDER_RE = /\bSMP-\d{6}-[A-Z0-9]{6}\b/gi;
const REAL_ORDER = { $or: [{ paymentMethod: { $ne: 'razorpay' } }, { paymentStatus: { $ne: 'pending' } }] };

/** One order as one line: status of each parcel, money state, what is wrong. */
const lineOrder = (o, sellerId) => {
  const fs = (o.fulfilments || []).filter((f) => !sellerId || String(f.sellerId) === String(sellerId));
  const items = (o.items || []).filter((i) => !sellerId || String(i.sellerId) === String(sellerId));
  const parts = fs.map((f) => {
    const bits = [f.status];
    if (f.awb) bits.push(`awb ${f.awb}${f.courierName ? ` (${f.courierName})` : ''}`);
    if (f.shippedAt) bits.push(`shipped ${when(f.shippedAt)}`);
    if (f.deliveredAt) bits.push(`delivered ${when(f.deliveredAt)}`);
    if (f.expectedDeliveryAt && f.status !== 'delivered') bits.push(`expected ${when(f.expectedDeliveryAt)}`);
    if (f.ndrAttempts) bits.push(`failed delivery ×${f.ndrAttempts}: ${f.ndrReason || ''}`);
    if (f.nprReason) bits.push(`courier did not collect: ${f.nprReason}`);
    if (f.returnStage) bits.push(`return ${f.returnStage}${f.returnResolution ? ` (${f.returnResolution})` : ''}${f.returnReason ? `: ${f.returnReason}` : ''}`);
    if (f.replacementStage) bits.push(`replacement ${f.replacementStage}`);
    if (f.disputeStatus) bits.push(`dispute ${f.disputeStatus}${f.disputeReason ? `: "${f.disputeReason}"` : ''}${f.disputeRaisedAt ? ` raised ${when(f.disputeRaisedAt)}` : ''}${f.disputeResolution ? ` - decision: ${f.disputeResolution}` : ''}`);
    if (f.cancelPenalty) bits.push(`cancel charge ₹${f.cancelPenalty}`);
    if (sellerId) {
      const p = sellerPayoutStateFor(o, sellerId);
      bits.push(`payout: ${p.state}${p.releasesAt ? ` on ${when(p.releasesAt)}` : ''}${p.blockedReason ? ` (${p.blockedReason})` : ''}`);
    }
    return bits.join(', ');
  });
  return `- ${o.orderNumber || o._id} · placed ${when(o.createdAt)} · ${items.map((i) => `${i.name} ×${i.quantity} @${money(i.price)}`).join('; ')} · ${o.paymentMethod === 'cod' ? 'COD' : 'prepaid'} ${o.paymentStatus}${o.cancelledBy ? ` · cancelled by ${o.cancelledBy}${o.cancellationReason ? ` (${o.cancellationReason})` : ''}` : ''} · ${parts.join(' | ') || o.status}`;
};

const orderScope = (role, user) => {
  if (role === 'seller') return { 'items.sellerId': user._id };
  if (role === 'customer') return { customerId: user._id };
  return {};
};

/** computePerformance's graded metrics as "value (status, limit)" lines. */
const gradedLines = (perf) =>
  Object.fromEntries(
    Object.entries(perf)
      .filter(([, v]) => v && typeof v === 'object')
      .map(([k, v]) => [k, `${v.value ?? '-'} (${v.status}${v.threshold != null ? `, limit ${v.threshold}` : ''})`])
  );

const STR = (description) => ({ type: 'STRING', description });
const INT = (description) => ({ type: 'INTEGER', description });

const TOOLS = [
  {
    name: 'getOrder',
    roles: ['seller', 'customer', 'admin'],
    description: 'Full status of one order by its number (SMP-YYMMDD-XXXXXX): items, parcel status, courier, delivery, return/dispute/cancel state, and for a seller the payout state of their lines.',
    parameters: { type: 'OBJECT', properties: { orderNumber: STR('The order number, e.g. SMP-260912-AB12CD') }, required: ['orderNumber'] },
    run: async ({ orderNumber }, { role, user }) => {
      const num = String(orderNumber || '').toUpperCase().match(ORDER_RE)?.[0];
      if (!num) return { error: 'That is not an order number (SMP-YYMMDD-XXXXXX)' };
      const q = Order.findOne({ orderNumber: num, ...orderScope(role, user) });
      const o = await (role === 'admin' ? q.populate('customerId', 'name email') : q).lean();
      if (!o) return { error: `No order ${num} that you can see` };
      const line = lineOrder(o, role === 'seller' ? user._id : null);
      return { order: line, ...(role === 'admin' ? { customer: `${o.customerId?.name} (${o.customerId?.email})`, sellers: [...new Set((o.items || []).map((i) => String(i.sellerId)))].length } : {}) };
    },
  },
  {
    name: 'myRecentOrders',
    roles: ['seller', 'customer'],
    description: "The asker's own recent orders, newest first. Optional status filter: pending, processing, shipped, delivered, cancelled, returned.",
    parameters: { type: 'OBJECT', properties: { status: STR('Optional parcel status to filter by'), limit: INT('How many, max 20 (default 10)') } },
    run: async ({ status, limit }, { role, user }) => {
      const n = Math.min(20, Math.max(1, Number(limit) || 10));
      const filter = { ...orderScope(role, user), ...REAL_ORDER };
      if (status) filter['fulfilments.status'] = String(status).toLowerCase();
      const rows = await Order.find(filter).sort({ createdAt: -1 }).limit(n).lean();
      return { count: rows.length, orders: rows.map((o) => lineOrder(o, role === 'seller' ? user._id : null)) };
    },
  },
  {
    name: 'myPayouts',
    roles: ['seller'],
    description: "The seller's payouts (paid and pending), what is currently payable, and any unclaimed charges/deductions with their reasons.",
    parameters: { type: 'OBJECT', properties: {} },
    run: async (_a, { user }) => {
      const sellerId = user._id;
      const [payouts, payable, charges] = await Promise.all([
        Payout.find({ sellerId }).sort({ createdAt: -1 }).limit(8).lean(),
        getPayableSummary(sellerId).catch(() => null),
        SellerCharge.find({ sellerId, payoutId: null }).lean(),
      ]);
      return {
        payouts: payouts.map((p) => `${p.payoutNumber || p._id}: ${p.status}, net ${money(p.netPayable)}${p.deductions ? `, deductions ${money(p.deductions)}` : ''}, period ${when(p.periodFrom)}–${when(p.periodTo)}${p.paidAt ? `, paid ${when(p.paidAt)}` : ''}${p.utr ? `, UTR ${p.utr}` : ''}`),
        payableNow: payable ? `${money(payable.netPayable ?? payable.total ?? 0)} across ${payable.itemCount ?? payable.count ?? '?'} delivered lines whose window has closed` : 'unknown',
        unclaimedCharges: charges.map((c) => `₹${c.amount} - ${c.note || c.kind}${c.orderNumber ? ` (order ${c.orderNumber})` : ''}`),
      };
    },
  },
  {
    name: 'productScore',
    roles: ['seller', 'admin'],
    description: 'Find a product by (part of) its name and return its price, stock, live/hidden state, Listing Quality score and the concrete fixes that would raise it.',
    parameters: { type: 'OBJECT', properties: { name: STR('Part of the product name') }, required: ['name'] },
    run: async ({ name }, { role, user }) => {
      const rx = new RegExp(String(name || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i');
      const filter = { name: rx, isDeleted: { $ne: true }, ...(role === 'seller' ? { sellerId: user._id } : {}) };
      const rows = await Product.find(filter).limit(5).lean();
      if (!rows.length) return { error: `No product matching "${name}"${role === 'seller' ? ' in your catalogue' : ''}` };
      return {
        products: rows.map((p) => {
          const s = scoreListing(p);
          return { name: p.name, price: money(p.price), stock: p.stock, live: Boolean(p.isActive), score: s.score, fixes: (s.fixes || []).slice(0, 4).map((f) => f.text || f), rating: p.avgRating ? `${p.avgRating} from ${p.totalReviews} reviews` : 'no reviews yet' };
        }),
      };
    },
  },
  {
    name: 'myPerformance',
    roles: ['seller'],
    description: "The seller's last-30-day performance against the rulebook: cancel rate, dispatch time, failed deliveries, RTO, rating, listing quality - each graded.",
    parameters: { type: 'OBJECT', properties: {} },
    run: async (_a, { user }) => {
      const sellerId = user._id;
      const since = new Date(Date.now() - 30 * 86400000);
      const [orders, products] = await Promise.all([
        Order.find({ 'items.sellerId': sellerId, createdAt: { $gte: since } }).select('fulfilments createdAt cancelledBy paymentMethod paymentStatus items').lean(),
        Product.find({ sellerId, isActive: true, isDeleted: { $ne: true } }).lean(),
      ]);
      const perf = computePerformance({ orders, sellerId, products: products.map((p) => ({ ...p, score: scoreListing(p).score })) });
      return { last30Days: gradedLines(perf), ordersCounted: perf.orders };
    },
  },
  {
    name: 'platformSummary',
    roles: ['admin'],
    description: 'The whole platform this week: orders, sales, take, new customers, cancels, returns, and what is open now (disputes, sellers waiting, payouts due, low stock, weak listings, Google impressions).',
    parameters: { type: 'OBJECT', properties: {} },
    run: async () => {
      const { gather } = require('../../jobs/weeklyDigest');
      const d = await gather();
      return d;
    },
  },
  {
    name: 'findSeller',
    roles: ['admin'],
    description: 'Look a seller up by shop name: status, approval, commission, pickup/bank set, product count, and their last 30-day performance.',
    parameters: { type: 'OBJECT', properties: { name: STR('Part of the shop name') }, required: ['name'] },
    run: async ({ name }) => {
      const rx = new RegExp(String(name || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i');
      const sellers = await Seller.find({ businessName: rx }).limit(5).lean();
      if (!sellers.length) return { error: `No seller matching "${name}"` };
      const out = [];
      for (const s of sellers) {
        const since = new Date(Date.now() - 30 * 86400000);
        const [orders, products] = await Promise.all([
          Order.find({ 'items.sellerId': s.userId, createdAt: { $gte: since } }).select('fulfilments createdAt cancelledBy paymentMethod paymentStatus items').lean(),
          Product.find({ sellerId: s.userId, isDeleted: { $ne: true } }).lean(),
        ]);
        const perf = computePerformance({ orders, sellerId: s.userId, products: products.filter((p) => p.isActive).map((p) => ({ ...p, score: scoreListing(p).score })) });
        out.push({
          shop: s.businessName, status: s.status, approved: s.isApproved, commissionPct: s.commissionRate, city: s.pickupAddress?.city || s.city || '-',
          pickupSet: Boolean(s.pickupAddress?.pincode), bankSet: Boolean(s.bankDetails?.accountNumber), agreement: s.agreement?.version || null,
          products: `${products.length} (${products.filter((p) => p.isActive).length} live)`, orders30d: orders.length,
          performance: gradedLines(perf),
        });
      }
      return { sellers: out };
    },
  },
  {
    name: 'listCategories',
    roles: ['seller', 'customer', 'admin'],
    description: 'The category tree (main categories and their sub-categories) as it exists on the platform right now.',
    parameters: { type: 'OBJECT', properties: { main: STR('Optional: only this main category') } },
    run: async ({ main }) => {
      const cats = await Category.find({}).select('name parentCategory').lean();
      const tops = cats.filter((c) => !c.parentCategory);
      const tree = tops
        .filter((t) => !main || t.name.toLowerCase().includes(String(main).toLowerCase()))
        .map((t) => `${t.name}: ${cats.filter((c) => String(c.parentCategory) === String(t._id)).map((c) => c.name).join(', ') || '(no sub-categories)'}`);
      return { mains: tops.length, tree };
    },
  },
  {
    name: 'searchKnowledge',
    roles: ['seller', 'customer', 'admin'],
    description: "Search ShopMaster Pro's own documentation and the explanations written in its code: how a flow works, why a rule exists, what a page does, what is planned. Use when the question is about how the platform behaves.",
    parameters: { type: 'OBJECT', properties: { query: STR('What to look for, in plain words') }, required: ['query'] },
    run: async ({ query }, { role }) => {
      const r = await retrieve(query, role, { k: 6 });
      return { via: r.via, passages: r.chunks.map((c) => ({ from: c.source, title: c.title, text: c.text.slice(0, 1500) })) };
    },
  },
  {
    name: 'webSearch',
    roles: ['seller', 'customer', 'admin'],
    description: 'Search the web (Google) for facts outside ShopMaster: how Amazon/Flipkart/Meesho/Myntra handle something, Indian consumer law, courier practice, GST, current events. Returns a sourced summary.',
    parameters: { type: 'OBJECT', properties: { query: STR('The search question') }, required: ['query'] },
    run: async ({ query }) => {
      const { generate } = require('../gemini');
      const r = await generate(`Search the web and answer factually with sources (site names) in under 200 words: ${String(query).slice(0, 400)}`, { grounded: true, textModel: 'gemini', attempts: 1, temperature: 0.2 });
      return r.ok ? { summary: r.text } : { error: `web search unavailable: ${r.reason.slice(0, 100)}` };
    },
  },
];

const declarationsFor = (role) =>
  TOOLS.filter((t) => t.roles.includes(role)).map(({ name, description, parameters }) => ({ name, description, parameters }));

/** Runs one tool for this asker; a tool outside the role is "unknown". */
const runTool = async (name, args, { role, user }) => {
  const tool = TOOLS.find((t) => t.name === name && t.roles.includes(role));
  if (!tool) return { error: `No tool named ${name}` };
  return tool.run(args || {}, { role, user });
};

module.exports = { TOOLS, declarationsFor, runTool, lineOrder, money, when, ORDER_RE, REAL_ORDER };
