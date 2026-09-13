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
const User = require('../../models/User');
const Coupon = require('../../models/Coupon');
const { evaluateCoupon } = require('../applyCoupon');
const { escapeRegex } = require('../catalogueFilter');

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
    name: 'myPayments',
    roles: ['customer'],
    description: "The customer's money on recent orders: what was paid and how, and every refund - its amount, whether it is done, pending or failed, and when it was sent. Use for 'refund kab aayega', 'paisa kata', 'payment failed'.",
    parameters: { type: 'OBJECT', properties: { orderNumber: STR('Optional: one order number like SMP-260906-1D876E. Omit for the last 8 orders.') } },
    run: async ({ orderNumber } = {}, { user }) => {
      const filter = { customerId: user._id, ...REAL_ORDER };
      if (orderNumber) filter.orderNumber = String(orderNumber).toUpperCase();
      const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(orderNumber ? 1 : 8).lean();
      if (!orders.length) return { note: orderNumber ? 'No such order on this account.' : 'No orders yet.' };
      return {
        payments: orders.map((o) => {
          const refunds = [];
          if (o.refundId) refunds.push(`order-level refund ${money(o.refundAmount || 0)}: ${o.refundStatus || 'initiated'}${o.refundedAt ? `, credited ${when(o.refundedAt)}` : ''}`);
          for (const i of o.items || []) if (i.refundId) refunds.push(`${i.name}: ${money(i.refundAmount || i.price * i.quantity)} ${i.refundStatus || 'initiated'}${i.refundedAt ? `, credited ${when(i.refundedAt)}` : ''}`);
          return `${o.orderNumber} · ${money(o.totalAmount)} · ${o.paymentMethod === 'cod' ? 'cash on delivery' : `paid online${o.razorpayPaymentId ? ' (Razorpay)' : ''}`} · payment ${o.paymentStatus}${refunds.length ? ` · refunds: ${refunds.join('; ')}` : ' · no refunds'}`;
        }),
        rule: 'A completed refund reaches the bank or card in 5-7 working days from the credited date; a COD order is refunded to the bank details the customer gives on the order page.',
      };
    },
  },
  {
    name: 'checkCoupon',
    roles: ['customer', 'seller'],
    description: 'Look up one coupon code: whether it is live, what it gives (percent or flat, any cap), the minimum order, the expiry, whose products it covers, and how many uses remain. Never invents a code.',
    parameters: { type: 'OBJECT', properties: { code: STR('The code as typed, e.g. DIWALI20') }, required: ['code'] },
    run: async ({ code } = {}, { user }) => {
      const c = await Coupon.findOne({ code: String(code || '').trim().toUpperCase() }).lean();
      if (!c) return { valid: false, reason: 'We do not have a code by that name.' };
      const v = evaluateCoupon(c, { lines: [], customerId: user._id });
      const gives = c.type === 'percent' ? `${c.value}% off${c.maxDiscount ? ` (up to ${money(c.maxDiscount)})` : ''}` : `${money(c.value)} off`;
      return {
        code: c.code,
        live: Boolean(c.isActive) && (!c.validUntil || new Date(c.validUntil) > new Date()),
        gives,
        minimumOrder: c.minOrderValue ? money(c.minOrderValue) : 'none',
        validUntil: c.validUntil ? when(c.validUntil) : 'no expiry',
        covers: c.fundedBy === 'seller' ? 'one seller\'s products only' : 'the whole marketplace',
        usesLeft: c.usageLimit ? Math.max(0, c.usageLimit - (c.usedCount || 0)) : 'unlimited',
        wouldApplyNow: v.ok ? 'yes, on an eligible basket' : v.reason,
      };
    },
  },
  {
    name: 'disputeBrief',
    roles: ['admin'],
    description: "The decision agent's brief for a disputed or contested-return parcel: the facts (proof of delivery, pack proof, photos, return timeline), a recommendation with confidence, and the note to write. Costs one model call unless cached; use when the admin asks what to decide on an order.",
    parameters: { type: 'OBJECT', properties: { orderNumber: STR('The order number, e.g. SMP-260906-1D876E'), sellerId: STR('Optional: the seller user id when the order has several parcels') }, required: ['orderNumber'] },
    run: async ({ orderNumber, sellerId } = {}) => {
      const o = await Order.findOne({ orderNumber: String(orderNumber || '').toUpperCase() }).select('_id fulfilments').lean();
      if (!o) return { error: 'No such order.' };
      const contested = (o.fulfilments || []).filter((f) => f.disputeStatus || f.returnStage);
      const sid = sellerId || (contested.length === 1 ? contested[0].sellerId : null);
      if (!sid) return { error: `This order has ${contested.length} contested parcels - say which seller.`, sellers: contested.map((f) => String(f.sellerId)) };
      const { briefDispute } = require('./decisionAgent');
      const r = await briefDispute(o._id, sid);
      if (!r.ok) return { error: r.reason };
      return { brief: r.brief, model: r.model, decideAt: '/admin/orders' };
    },
  },
  {
    name: 'customerRisk',
    roles: ['admin'],
    description: "A customer's 180-day record (orders, returns and return rate, refused COD, disputes won/lost, RTO, empty-box claims, goodwill used) plus the risk level an admin set and its reason. Find the customer by email or name.",
    parameters: { type: 'OBJECT', properties: { email: STR('The customer\'s email, if known'), name: STR('Or a name to search') } },
    run: async ({ email, name } = {}) => {
      const filter = email ? { email: String(email).trim().toLowerCase() } : name ? { name: new RegExp(escapeRegex(String(name).trim()), 'i') } : null;
      if (!filter) return { error: 'Give an email or a name.' };
      const users = await User.find({ ...filter, role: { $ne: 'admin' } }).select('name email risk createdAt').limit(3).lean();
      if (!users.length) return { note: 'No customer matches.' };
      const { customerRisk } = require('../risk');
      const out = [];
      for (const u of users) {
        const r = await customerRisk(u._id);
        out.push({ name: u.name, email: u.email, since: when(u.createdAt), setByAdmin: u.risk?.level && u.risk.level !== 'none' ? `${u.risk.level}: ${u.risk.reason || ''}` : 'none', record: `${r.orders} orders, ${r.delivered} delivered, ${r.returns} returns (${r.returnRate}%), ${r.refused} COD refused, disputes won ${r.disputesWon}/lost ${r.disputesLost}, RTO ${r.rto}, empty-box ${r.emptyBox}, goodwill ${r.goodwill}`, signals: r.signals, level: r.level, manageAt: '/admin/customers' });
      }
      return { customers: out };
    },
  },
  {
    name: 'googleReadiness',
    roles: ['seller', 'admin'],
    description: "The Google coach for one of the seller's products: its readiness score out of 100, the fixes in order of points, and the search words real people typed (Google Search Console, ShopMaster's own search box, the synonym family) with counts. Use for 'Google pe kaise aaye', 'SEO', 'keywords', 'title kaisa ho', 'near me'. For shop-level questions call it without a product.",
    parameters: { type: 'OBJECT', properties: { productName: STR('Part of the product title, or omit for the shop-level list') } },
    run: async ({ productName } = {}, { role, user }) => {
      const { keywordEvidence, shopReadiness } = require('../googleReadiness');
      const sellerId = role === 'seller' ? user._id : null;
      if (!productName) {
        if (!sellerId) return { error: 'Name a product, or ask as the seller for the shop-level list.' };
        const r = await shopReadiness(sellerId);
        return {
          products: `${r.products.total} products, average readiness ${r.products.avg}/100, ${r.products.weak.length} under 80`,
          weakest: r.products.weak.slice(0, 5).map((p) => `${p.name}: ${p.score}/100 - first fix: ${p.topFix}`),
          nearMe: `location shown on shop page: ${r.nearMe.showLocation ? 'yes' : 'NO'} · city named in About: ${r.nearMe.cityInAbout ? 'yes' : 'NO'} · pickup address set: ${r.nearMe.pickupSet ? 'yes' : 'NO'} · Google Business Profile linked: ${r.nearMe.gbpLinked ? 'yes' : 'NO'}`,
          faqsMissing: `${r.faqsMissing} products without two Q&As`,
          fixAt: '/seller/products (open a product), /seller/settings (location, About, links), /seller/grow',
        };
      }
      const filter = { name: new RegExp(escapeRegex(String(productName).trim()), 'i'), isDeleted: { $ne: true } };
      if (sellerId) filter.sellerId = sellerId;
      const p = await Product.findOne(filter).populate('category', 'name').lean();
      if (!p) return { note: 'No product by that name' + (sellerId ? ' in this shop.' : '.') };
      const r = scoreListing(p);
      const ev = await keywordEvidence({ sellerId: p.sellerId, name: p.name, categoryName: p.category?.name, tags: p.tags, description: p.description }).catch(() => ({ words: [], google: false }));
      return {
        product: p.name,
        readiness: `${Math.round((r.score / r.max) * 100)}/100`,
        fixes: r.fixes.slice(0, 6).map((x) => `+${x.points}: ${x.text}`),
        searchWords: ev.words.slice(0, 10).map((w) => `${w.word} - ${w.note}`),
        googleData: ev.google ? 'Search Console read' : 'Search Console not available - words are from our shoppers and the synonym family',
        editAt: `/seller/products/${p._id}`,
      };
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
      const ask = `Search the web and answer factually with sources (site names) in under 200 words: ${String(query).slice(0, 400)}`;
      const { generate } = require('../gemini');
      const r = await generate(ask, { grounded: true, textModel: 'gemini', attempts: 1, temperature: 0.2 });
      if (r.ok) return { summary: r.text, via: 'google' };
      // Gemini's grounding is out for the day: Groq's compound-mini carries its
      // own web search (70k tokens/minute), so the outside world stays reachable.
      const { groqPlain } = require('./groq');
      const g = await groqPlain([{ role: 'user', parts: [{ text: ask }] }], { model: 'groq/compound-mini', temperature: 0.2 });
      return g.ok ? { summary: g.text, via: 'compound' } : { error: `web search unavailable: ${r.reason.slice(0, 60)}; ${g.reason.slice(0, 60)}` };
    },
  },
];

/**
 * A suspended seller may still ask - about open orders, the rule they broke,
 * how to come back - but not plan growth. So: the read-only tools about
 * their own orders and the rulebook, nothing about listings or payouts.
 */
const SUSPENDED_SELLER_TOOLS = ['getOrder', 'myRecentOrders', 'myPerformance', 'searchKnowledge', 'webSearch'];
const allowed = (t, role, user) => t.roles.includes(role) && !(role === 'seller' && user?.sellerStatus === 'suspended' && !SUSPENDED_SELLER_TOOLS.includes(t.name));

const declarationsFor = (role, user = null) =>
  TOOLS.filter((t) => allowed(t, role, user)).map(({ name, description, parameters }) => ({ name, description, parameters }));

/** Runs one tool for this asker; a tool outside the role is "unknown". */
const runTool = async (name, args, { role, user }) => {
  const tool = TOOLS.find((t) => t.name === name && allowed(t, role, user));
  if (!tool) return { error: `No tool named ${name}` };
  return tool.run(args || {}, { role, user });
};

module.exports = { TOOLS, declarationsFor, runTool, lineOrder, money, when, ORDER_RE, REAL_ORDER };
