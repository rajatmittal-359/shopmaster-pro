const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const { scoreListing } = require('../utils/listingScore');
const { stepsFor } = require('../controllers/growController');
const notifier = require('../utils/notify');
const { frontendUrl } = require('../utils/appUrl');

/**
 * The Monday note: three things that grow the shop this week (plan 2.25,
 * 15 Sep 2026 - the "seller growth note").
 *
 * WHY
 *   Grow lists twelve steps. A shopkeeper on a Monday morning wants three,
 *   in order, with a button. Shopify sends "your weekly summary", Amazon
 *   sends "recommendations for your listings" - the nudge that gets a page
 *   opened. Ours is built from the same steps the Grow page shows, so what
 *   the note says and what the page says can never disagree.
 *
 * WHAT IT PICKS
 *   Undone steps, Essential before Optional, the ones closest to done
 *   first - the smallest push that finishes something. Never more than
 *   three; nothing at all for a shop with nothing left (silence is the
 *   compliment). One bell row per seller per week (tag), push and mail as
 *   their own preferences say - the "growth" category, which a seller can
 *   switch off in Settings → Notifications.
 *
 * COST
 *   No model. Reads products and settings, writes one notification. Runs
 *   from GitHub Actions on Monday 03:30 UTC (09:00 IST) with the low-stock
 *   alert, so the two land together.
 */

const weekTag = (d = new Date()) => {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
  return `growth-${d.getUTCFullYear()}-w${week}`;
};

/** The three, from the same steps Grow shows. */
const pickThree = (steps) =>
  steps
    .filter((s) => !s.done)
    .sort((a, b) => (a.level === b.level ? (b.value || 0) - (a.value || 0) : a.level === 'essential' ? -1 : 1))
    .slice(0, 3);

const gatherFor = async (seller) => {
  const sellerId = seller.userId;
  const products = await Product.find({ sellerId, isActive: true, isDeleted: { $ne: true } }).populate('category', 'name').lean();
  const [reviews, coupons] = await Promise.all([
    Review.countDocuments({ productId: { $in: products.map((p) => p._id) } }),
    Coupon.countDocuments({ fundedBy: 'seller', sellerId, isActive: true, $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }] }),
  ]);
  const scored = products.map((p) => ({ ...p, score: scoreListing({ ...p, category: (p.category && p.category._id) || p.category }).score }));
  return stepsFor({ seller, products, scored, reviews, coupons });
};

const render = (seller, three) => {
  const SITE = frontendUrl();
  const lines = three.map((s, i) => `${i + 1}. ${s.title}${s.progress ? ` (${s.progress})` : ''}${s.minutes ? ` · ${s.minutes} min` : ''}`);
  const title = `This week, 3 things for ${seller.businessName || 'your shop'}`;
  const body = lines.join(' · ');
  const li = three
    .map(
      (s) => `<li style="margin:0 0 12px 0">
        <a href="${SITE}${s.href || '/seller/grow'}" style="font-weight:600;color:#111827;text-decoration:none">${s.title}</a>
        ${s.progress ? `<span style="color:#6b7280"> · ${s.progress}</span>` : ''}${s.minutes ? `<span style="color:#6b7280"> · about ${s.minutes} min</span>` : ''}
        <div style="font-size:14px;color:#4b5563;margin-top:2px">${s.why || ''}</div>
        ${s.how ? `<div style="font-size:14px;color:#374151;margin-top:2px"><strong>How:</strong> ${s.how}</div>` : ''}
      </li>`
    )
    .join('');
  const mail = {
    subject: `${seller.businessName || 'Your shop'}: 3 things this week`,
    text: `${title}\n\n${lines.join('\n')}\n\nOpen Grow: ${SITE}/seller/grow\n\nOne a day is plenty. Reply to this mail if something is unclear.`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:8px 4px;font-size:16px;line-height:1.6;color:#1f2937">
      <h2 style="font-size:20px;margin:0 0 6px 0;color:#111827">This week, three things</h2>
      <p style="margin:0 0 16px 0;color:#6b7280;font-size:14px">${seller.businessName || 'Your shop'} on ShopMaster Pro. Ten minutes each, one a day is plenty.</p>
      <ol style="padding-left:20px;margin:0 0 16px 0">${li}</ol>
      <p style="margin:0 0 20px 0"><a href="${SITE}/seller/grow" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:9px;font-weight:600">Open Grow</a></p>
      <p style="font-size:13px;color:#9ca3af">Weekly, Monday morning. Turn it off under Settings → Notifications → Growth.</p>
    </div>`,
  };
  return { title, body, mail };
};

/**
 * @returns {Promise<{sellers:number, sent:number, skipped:number, errors:number}>}
 */
const sendGrowthNotes = async ({ now = new Date() } = {}) => {
  const sellers = await Seller.find({ isApproved: true, status: { $ne: 'suspended' } }).lean();
  const tag = weekTag(now);
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  for (const seller of sellers) {
    try {
      const three = pickThree(await gatherFor(seller));
      if (!three.length) {
        skipped += 1;
        continue;
      }
      const { title, body, mail } = render(seller, three);
      await notifier.notify({ userId: seller.userId, role: 'seller', category: 'growth', title, body, url: '/seller/grow', tag, mail });
      sent += 1;
    } catch (err) {
      errors += 1;
      console.error(`growth note for ${seller.businessName || seller._id} failed:`, err.message);
    }
  }
  return { sellers: sellers.length, sent, skipped, errors, tag };
};

module.exports = { sendGrowthNotes, pickThree, render, weekTag };
