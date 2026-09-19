const Cart = require('../models/Cart');
const Product = require('../models/Product');
const notifier = require('../utils/notify');
const { withoutHiddenSellers } = require('../utils/hiddenSellers');
const { effectivePrice } = require('../utils/discount');
const { frontendUrl } = require('../utils/appUrl');

/**
 * The bag reminder (19 Sep 2026).
 *
 * WHY
 *   Seven in ten bags are left without an order (Baymard, 2025 average
 *   70.2%), and the one message that reliably brings some back is a plain
 *   "you left these" a day later - Amazon, Flipkart and Myntra all send it;
 *   Klaviyo's benchmark puts it at the highest revenue per mail of any
 *   automated flow. No coupon in it, on purpose: a discount in the reminder
 *   teaches people to abandon the bag to get one (Baymard says so; Amazon
 *   never does it).
 *
 * WHEN, AND HOW OFTEN
 *   Once, 20-48 hours after the bag was last touched; at most one reminder
 *   per person per week whatever they do with the bag. Daily from Actions at
 *   04:45 UTC (10:15 IST), so it lands mid-morning, not at night. Only items
 *   that are still live and in stock are named; a bag whose items have all
 *   gone is left alone. The price shown is today's - the mail says so.
 *
 * WHO
 *   Signed-in customers only (a guest bag lives in the browser; there is no
 *   address to write to). Under the "reminders" category, so Settings →
 *   Notifications switches it off for mail and push alike; the bell row is
 *   tagged per week so a re-run does not double up.
 */
const MIN_AGE_HOURS = 20;
const MAX_AGE_HOURS = 48;
const GAP_DAYS = 7;

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
// Product names are typed by sellers; in HTML they are text, never markup.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const weekTag = (d) => `cart-${new Date(d).toISOString().slice(0, 10)}`;

/** The bag's items that are still worth naming - live, in stock, seller visible. */
const liveItems = async (cart, now) => {
  const ids = (cart.items || []).map((i) => i.productId).filter(Boolean);
  if (!ids.length) return [];
  const filter = await withoutHiddenSellers({ _id: { $in: ids }, isActive: true, isDeleted: { $ne: true } });
  const products = await Product.find(filter).select('name slug price salePrice saleEndsAt images stock reserved sellerId').lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return (cart.items || [])
    .map((i) => {
      const p = byId.get(String(i.productId));
      if (!p || (Number(p.stock) || 0) - (Number(p.reserved) || 0) <= 0) return null;
      return { name: p.name, slug: p.slug || String(p._id), image: p.images?.[0] || '', quantity: i.quantity || 1, price: effectivePrice(p, now).price };
    })
    .filter(Boolean);
};

/** The words - pure, so a test can read them. */
const render = (items) => {
  const SITE = frontendUrl();
  const total = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const first = items[0];
  const more = items.length - 1;
  const title = more > 0 ? `${first.name} and ${more} more ${more === 1 ? 'item is' : 'items are'} still in your bag` : `${first.name} is still in your bag`;
  const body = `${items.length} item${items.length === 1 ? '' : 's'} · ${inr(total)} · prices and stock can change`;
  const rows = items
    .map(
      (i) => `<tr>
        <td style="padding:8px 12px 8px 0;width:64px">${i.image ? `<img src="${esc(i.image)}" width="64" height="64" alt="" style="border-radius:8px;object-fit:cover;display:block">` : ''}</td>
        <td style="padding:8px 0"><a href="${SITE}/products/${encodeURIComponent(i.slug)}" style="font-weight:600;color:#111827;text-decoration:none">${esc(i.name)}</a><div style="font-size:14px;color:#6b7280">${i.quantity > 1 ? `${i.quantity} × ` : ''}${inr(i.price)}</div></td>
      </tr>`
    )
    .join('');
  const mail = {
    subject: title,
    text: `${title}\n\n${items.map((i) => `- ${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''} · ${inr(i.price)}`).join('\n')}\n\nTotal today: ${inr(total)}\nOpen your bag: ${SITE}/cart\n\nPrices and stock can change; nothing is held for you. Turn these reminders off under Account → Notifications → Reminders.`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:8px 4px;font-size:16px;line-height:1.6;color:#1f2937">
      <h2 style="font-size:20px;margin:0 0 6px 0;color:#111827">Still in your bag</h2>
      <p style="margin:0 0 16px 0;color:#6b7280;font-size:14px">You left ${items.length === 1 ? 'this' : 'these'} on ShopMaster Pro yesterday. Prices and stock can change; nothing is held for you.</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px 0">${rows}</table>
      <p style="margin:0 0 20px 0"><a href="${SITE}/cart" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:9px;font-weight:600">Open your bag · ${inr(total)}</a></p>
      <p style="font-size:13px;color:#9ca3af">One reminder, at most once a week. Turn it off under Account → Notifications → Reminders.</p>
    </div>`,
  };
  return { title, body, mail };
};

/**
 * @returns {Promise<{carts:number, sent:number, skipped:number, errors:number}>}
 */
const remind = async ({ now = new Date() } = {}) => {
  const newest = new Date(now.getTime() - MIN_AGE_HOURS * 3600 * 1000);
  const oldest = new Date(now.getTime() - MAX_AGE_HOURS * 3600 * 1000);
  const gap = new Date(now.getTime() - GAP_DAYS * 86400 * 1000);
  const carts = await Cart.find({ 'items.0': { $exists: true }, updatedAt: { $gte: oldest, $lte: newest }, $or: [{ remindedAt: null }, { remindedAt: { $lt: gap } }] })
    .select('userId items updatedAt remindedAt')
    .lean();
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  for (const cart of carts) {
    try {
      const items = await liveItems(cart, now);
      if (!items.length) {
        skipped += 1;
        continue;
      }
      // Stamp first: a mail that goes out twice is worse than one that never went.
      const stamped = await Cart.updateOne({ _id: cart._id, $or: [{ remindedAt: null }, { remindedAt: { $lt: gap } }] }, { $set: { remindedAt: now } }, { timestamps: false }); // updatedAt stays "last touched by the customer"
      if (!stamped.modifiedCount) {
        skipped += 1;
        continue;
      }
      const { title, body, mail } = render(items);
      await notifier.notify({ userId: cart.userId, role: 'customer', category: 'reminders', title, body, url: '/cart', tag: weekTag(now), mail });
      sent += 1;
    } catch (err) {
      errors += 1;
      console.error(`bag reminder for cart ${cart._id} failed:`, err.message);
    }
  }
  return { carts: carts.length, sent, skipped, errors };
};

module.exports = { remind, render, liveItems, weekTag, MIN_AGE_HOURS, MAX_AGE_HOURS, GAP_DAYS };
