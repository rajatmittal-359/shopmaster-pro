const Order = require('../models/Order');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const Payout = require('../models/Payout');
const User = require('../models/User');
const Review = require('../models/Review');
const sendSafeEmail = require('../utils/sendSafeEmail');
const { frontendUrl } = require('../utils/appUrl');
const { scoreListing } = require('../utils/listingScore');

/**
 * The Saturday-morning email to the admin.
 *
 * WHY
 *   Rajat works Monday to Friday and runs the marketplace on weekends. A
 *   panel he has to open to find out whether anything happened is a panel
 *   he opens on Saturday afternoon, worried. One mail at 8 AM Saturday -
 *   the week in numbers, then the short list of what needs a decision -
 *   read on the phone over tea, panel opened only when something does.
 *
 * WHAT IT HOLDS (last 7 days unless said)
 *   orders, sales, the platform's take, cancels, returns, disputes open,
 *   sellers waiting, payouts due, low stock, weak listings, new reviews,
 *   and - when Google is connected - clicks and impressions.
 *
 * Runs from cron on Saturday 08:00 IST and on demand from
 * GET /admin/digest (preview) / POST /admin/digest/send.
 */
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const actionable = { $or: [{ paymentMethod: { $ne: 'razorpay' } }, { paymentStatus: { $ne: 'pending' } }] };

const gather = async () => {
  const since = new Date(Date.now() - 7 * 86400000);
  const [orders, disputesOpen, pendingSellers, payoutsDue, lowStock, products, newReviews, newCustomers] = await Promise.all([
    Order.find({ createdAt: { $gte: since }, ...actionable }).select('totalAmount paymentStatus status cancelledBy items fulfilments createdAt').lean(),
    Order.countDocuments({ 'fulfilments.disputeStatus': 'open' }),
    Seller.countDocuments({ isApproved: { $ne: true }, kycStatus: { $ne: 'rejected' } }),
    Payout.countDocuments({ status: 'pending' }),
    Product.countDocuments({ isActive: true, isDeleted: { $ne: true }, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
    Product.find({ isActive: true, isDeleted: { $ne: true } }).select('name images description category color gender ageGroup brand weight tags').lean(),
    Review.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ role: 'customer', createdAt: { $gte: since } }),
  ]);
  const paid = orders.filter((o) => o.paymentStatus === 'paid' || o.paymentMethod === 'cod');
  const sales = paid.reduce((n, o) => n + (o.totalAmount || 0), 0);
  const take = paid.reduce((n, o) => n + (o.items || []).reduce((m, i) => m + (i.commissionAmount || 0), 0), 0);
  const cancelledBySeller = orders.filter((o) => o.cancelledBy === 'seller').length;
  const cancelledByCustomer = orders.filter((o) => o.cancelledBy === 'customer').length;
  const returns = orders.filter((o) => (o.fulfilments || []).some((f) => f.returnStage && f.returnStage !== 'rejected')).length;
  const weak = products.filter((p) => scoreListing(p).score < 60).length;

  let google = null;
  try {
    const { queries } = require('../utils/google/searchConsole');
    const r = await queries({ days: 7, limit: 200 });
    if (r.ok) {
      google = {
        impressions: r.rows.reduce((n, x) => n + x.impressions, 0),
        clicks: r.rows.reduce((n, x) => n + x.clicks, 0),
        top: [...r.rows].sort((a, b) => b.impressions - a.impressions).slice(0, 3).map((x) => x.query),
      };
    }
  } catch {
    google = null;
  }

  return {
    since,
    orders: orders.length,
    sales,
    take,
    cancelledBySeller,
    cancelledByCustomer,
    returns,
    disputesOpen,
    pendingSellers,
    payoutsDue,
    lowStock,
    weak,
    products: products.length,
    newReviews,
    newCustomers,
    google,
  };
};

const render = (d) => {
  const site = frontendUrl();
  const needs = [
    d.disputesOpen && [`${d.disputesOpen} dispute${d.disputesOpen > 1 ? 's' : ''} open - a decision is yours`, `${site}/admin/orders`],
    d.pendingSellers && [`${d.pendingSellers} seller${d.pendingSellers > 1 ? 's' : ''} waiting for approval`, `${site}/admin/sellers`],
    d.payoutsDue && [`${d.payoutsDue} payout${d.payoutsDue > 1 ? 's' : ''} to release`, `${site}/admin/payouts`],
    d.lowStock && [`${d.lowStock} product${d.lowStock > 1 ? 's' : ''} low on stock`, `${site}/admin/products`],
    d.weak && [`${d.weak} weak listing${d.weak > 1 ? 's' : ''} (score under 60)`, `${site}/admin/products`],
  ].filter(Boolean);

  const row = (k, v) => `<tr><td style="padding:6px 0;color:#555">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600">${v}</td></tr>`;
  const html = `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#111">
    <h2 style="margin:0 0 4px;font-size:20px">Your week at ShopMaster Pro</h2>
    <p style="margin:0 0 16px;color:#666;font-size:13px">${d.since.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - today</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${row('Orders', d.orders)}
      ${row('Sales', money(d.sales))}
      ${row("Platform's take", money(d.take))}
      ${row('New customers', d.newCustomers)}
      ${row('New reviews', d.newReviews)}
      ${row('Cancelled', `${d.cancelledBySeller} by sellers · ${d.cancelledByCustomer} by customers`)}
      ${row('Returns opened', d.returns)}
      ${d.google ? row('Google, 7 days', `${d.google.impressions} shown · ${d.google.clicks} clicks`) : ''}
    </table>
    ${d.google && d.google.top.length ? `<p style="font-size:13px;color:#555;margin:8px 0 0">People searched: ${d.google.top.map((q) => `“${esc(q)}”`).join(', ')}</p>` : ''}
    <h3 style="margin:22px 0 8px;font-size:16px">${needs.length ? 'Needs you this weekend' : 'Nothing needs you this weekend 🎉'}</h3>
    ${needs.length ? `<ul style="padding-left:18px;margin:0;font-size:15px;line-height:1.7">${needs.map(([t, h]) => `<li><a href="${h}" style="color:#4f3ab8">${t}</a></li>`).join('')}</ul>` : ''}
    <p style="margin:22px 0 0"><a href="${site}/admin" style="display:inline-block;background:#4f3ab8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:600">Open the admin panel</a></p>
    <p style="font-size:12px;color:#666;margin-top:16px">Sent every Saturday at 8 AM. ${d.products} live products across the shop.</p>
  </div>`;
  const text = `Your week: ${d.orders} orders, ${money(d.sales)} sales, take ${money(d.take)}. Needs you: ${needs.map(([t]) => t).join('; ') || 'nothing'}. ${site}/admin`;
  return { subject: `Your week: ${d.orders} orders, ${money(d.sales)}${needs.length ? ` · ${needs.length} thing${needs.length > 1 ? 's' : ''} need you` : ' · nothing needs you'}`, html, text };
};

const sendWeeklyDigest = async () => {
  const admins = await User.find({ role: 'admin' }).select('email').lean();
  const data = await gather();
  const mail = render(data);
  let sent = 0;
  for (const a of admins) {
    if (!a.email) continue;
    await sendSafeEmail({ toUserId: a._id, toEmail: a.email, ...mail });
    sent += 1;
  }
  return { sent, data };
};

module.exports = { gather, render, sendWeeklyDigest };
