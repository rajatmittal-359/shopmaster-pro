require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Notification = require('./models/Notification');
const User = require('./models/User');

/**
 * One-time: give every bell its history (plan 2.30).
 *
 *   npm run notifications:backfill
 *
 * Walks the last 60 days of orders and writes the rows the dispatcher
 * would have written had it existed: the customer's confirmed / shipped /
 * delivered lines, the seller's new-order line, open disputes for the
 * admins. Dated at the moment they happened, marked read (nobody should
 * open the panel to 40 unread lines about last month). Re-runnable - the
 * tag index makes a second run a no-op.
 *
 * No push, no mail - this is the record, not a broadcast.
 */
const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const line = (order) => {
  const names = (order.items || []).map((i) => i.name).filter(Boolean);
  const first = names[0] || 'your order';
  return names.length > 1 ? `${first} +${names.length - 1} more` : first;
};

const put = async (rows, doc, at) => {
  rows.push({
    updateOne: {
      filter: { userId: doc.userId, tag: doc.tag },
      update: { $setOnInsert: { ...doc, readAt: at, createdAt: at, updatedAt: at } },
      upsert: true,
      timestamps: false,
    },
  });
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const orders = await Order.find({ createdAt: { $gte: since } }).lean();
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  const rows = [];
  for (const o of orders) {
    const url = `/orders/${o._id}`;
    if (o.paymentStatus === 'paid' || o.paymentMethod === 'cod') {
      await put(rows, { userId: o.customerId, role: 'customer', category: 'orders', title: `Order confirmed · ${o.orderNumber}`, body: `${line(o)} · ${o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid'} · ${money(o.totalAmount)}`, url, tag: `confirmed-${o._id}` }, o.createdAt);
      const sellers = [...new Set((o.items || []).map((i) => String(i.sellerId)))];
      for (const s of sellers) {
        const what = (o.items || []).filter((i) => String(i.sellerId) === s).map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ');
        await put(rows, { userId: s, role: 'seller', category: 'orders', title: 'नया ऑर्डर आया है 🎉', body: `${what} · ${o.paymentMethod === 'cod' ? 'COD' : 'Paid'}`, url: `/seller/orders/${o._id}`, tag: `order-${o._id}` }, o.createdAt);
      }
    }
    for (const f of o.fulfilments || []) {
      if (f.shippedAt || ['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(f.status)) {
        await put(rows, { userId: o.customerId, role: 'customer', category: 'orders', title: `Shipped · ${o.orderNumber}`, body: `${line(o)}${f.shippingCourierName ? ` · ${f.shippingCourierName}` : ''}${f.shippingAwb ? ` · ${f.shippingAwb}` : ''}`, url, tag: `shipped-${o._id}` }, f.shippedAt || o.updatedAt);
      }
      if (f.status === 'delivered') {
        await put(rows, { userId: o.customerId, role: 'customer', category: 'orders', title: `Delivered · ${o.orderNumber}`, body: `${line(o)} · Not right? You have 7 days to return.`, url, tag: `delivered-${o._id}` }, f.deliveredAt || o.updatedAt);
      }
      if (f.returnRequestedAt) {
        await put(rows, { userId: f.sellerId, role: 'seller', category: 'returns', title: 'वापसी माँगी है · Return requested', body: `${line(o)} · ${f.returnReason || ''}`.slice(0, 200), url: `/seller/orders/${o._id}`, tag: `return-${o._id}-${f.sellerId}` }, f.returnRequestedAt);
      }
      if (f.disputeRaisedAt) {
        await put(rows, { userId: f.sellerId, role: 'seller', category: 'disputes', title: 'शिकायत · Dispute - 72 घंटे', body: `${line(o)} · “${f.disputeReason || ''}”`.slice(0, 200), url: `/seller/orders/${o._id}`, tag: `dispute-${o._id}-${f.sellerId}` }, f.disputeRaisedAt);
        for (const a of admins) await put(rows, { userId: a._id, role: 'admin', category: 'disputes', title: `Dispute opened · ${o.orderNumber}`, body: String(f.disputeReason || '').slice(0, 160), url: '/admin/orders', tag: `dispute-open-${o._id}` }, f.disputeRaisedAt);
      }
      if (f.returnNeedsApproval && !f.returnApprovedAt && f.returnStage === 'requested') {
        for (const a of admins) await put(rows, { userId: a._id, role: 'admin', category: 'returns', title: `Return waiting for approval · ${o.orderNumber}`, body: String(f.returnReason || '').slice(0, 160), url: '/admin/trust', tag: `return-approval-${o._id}` }, f.returnRequestedAt || o.updatedAt);
      }
    }
  }
  const r = rows.length ? await Notification.bulkWrite(rows, { ordered: false }) : { upsertedCount: 0 };
  console.log(`orders read: ${orders.length}, rows offered: ${rows.length}, written: ${r.upsertedCount}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
