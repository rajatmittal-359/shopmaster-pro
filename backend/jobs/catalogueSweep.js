const Seller = require('../models/Seller');
const Product = require('../models/Product');
const notifier = require('../utils/notify');
const { frontendUrl } = require('../utils/appUrl');
const { weekTag } = require('./growthNote');

/**
 * The Thursday catalogue sweep - the "catalogue agent" of plan 2.25/2.32,
 * built without a model (19 Sep 2026).
 *
 * WHY
 *   Listings rot quietly: a product uploaded with one photo, two products
 *   that share a description (the seeded catalogue had 35 of them), a
 *   duplicate name from a re-upload, an MRP below the price, a registered
 *   seller's product with no HSN. None of it errors; all of it costs sales,
 *   Merchant Center approvals or a correct invoice. Amazon's "Listing
 *   quality dashboard" and Shopify's "products needing attention" exist for
 *   this. Ours is a weekly pass over every live product that tells each
 *   seller the three worst things, with the button, and tells the admin the
 *   totals.
 *
 * WHY NO MODEL
 *   Every check here is a fact about the document - counts, equality, a
 *   missing field. A model would cost quota to reach the same answer less
 *   reliably. The model-shaped checks (is this photo a counterfeit, is the
 *   alt text right) stay in the ledger for the day they earn their place.
 *
 * WHAT IT SENDS
 *   Per seller: one bell row + push + mail under the "growth" category (the
 *   same off-switch as Monday's note), tagged per week so a re-run does not
 *   double up. Nothing for a clean catalogue. Per admin: one row with the
 *   counts across sellers. Thursday 03:35 UTC (09:05 IST) from Actions.
 */

/** The checks, worst first - the order the seller sees them in. */
const CHECKS = [
  { key: 'no_photo', label: 'No photo', why: 'A product without a photo does not sell and is not sent to Google.', test: (p) => !(p.images || []).length },
  { key: 'tax_facts_missing', label: 'HSN or GST rate missing', why: 'Your shop is GST-registered; the tax invoice printed in your name needs both.', test: (p, ctx) => ctx.registered && (!p.hsn || p.gstRate === null || p.gstRate === undefined) },
  { key: 'mrp_below_price', label: 'MRP is below the price', why: 'Legally the selling price cannot exceed the MRP; the page also shows no discount.', test: (p) => typeof p.mrp === 'number' && p.mrp > 0 && p.mrp < p.price },
  { key: 'shared_description', label: 'Same description as another product', why: 'Google treats copies as one page; buyers read it as a template.', test: (p, ctx) => ctx.descriptionCount.get(normText(p.description)) > 1 },
  { key: 'duplicate_name', label: 'Same name as another product', why: 'Two listings with one name split their reviews and confuse search.', test: (p, ctx) => !p.variantGroupId && ctx.nameCount.get(normText(p.name)) > 1 },
  { key: 'thin_description', label: 'Description under 40 words', why: 'Material, size, care and use - the four things a buyer asks before paying.', test: (p) => wordCount(p.description) < 40 },
  { key: 'one_photo', label: 'Only one photo', why: 'Three angles roughly double add-to-cart; the second photo is the one most shops skip.', test: (p) => (p.images || []).length === 1 },
];

const normText = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
const wordCount = (s) => normText(s).split(' ').filter(Boolean).length;

const countBy = (products, fn) => {
  const m = new Map();
  for (const p of products) {
    const k = fn(p);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
};

/**
 * The findings for one seller's live products - pure, so it can be tested.
 * @param {object[]} products   active, undeleted products of one seller
 * @param {{registered?:boolean}} [opts]
 * @returns {{issues: Array<{productId:string, name:string, key:string, label:string, why:string}>, counts: Record<string,number>}}
 */
const findings = (products, { registered = false } = {}) => {
  const ctx = {
    registered,
    descriptionCount: countBy(products, (p) => normText(p.description)),
    nameCount: countBy(products, (p) => normText(p.name)),
  };
  const issues = [];
  const counts = {};
  for (const check of CHECKS) {
    for (const p of products) {
      if (!check.test(p, ctx)) continue;
      issues.push({ productId: String(p._id), name: p.name, key: check.key, label: check.label, why: check.why });
      counts[check.key] = (counts[check.key] || 0) + 1;
    }
  }
  return { issues, counts };
};

/** The three the seller is told about: worst check first, one line per product. */
const pickThree = (issues) => {
  const seen = new Set();
  const out = [];
  for (const i of issues) {
    if (seen.has(i.productId)) continue;
    seen.add(i.productId);
    out.push(i);
    if (out.length === 3) break;
  }
  return out;
};

const render = (seller, three, total) => {
  const SITE = frontendUrl();
  const more = total - three.length;
  const title = `${three.length} listing${three.length > 1 ? 's' : ''} to fix · ${three.length} लिस्टिंग ठीक करें`;
  const body = three.map((i) => `${i.name}: ${i.label}`).join(' · ') + (more > 0 ? ` · +${more} more` : '');
  const li = three
    .map(
      (i) => `<li style="margin:0 0 12px 0">
        <a href="${SITE}/seller/products/${i.productId}" style="font-weight:600;color:#111827;text-decoration:none">${escapeHtml(i.name)}</a>
        <span style="color:#b91c1c"> · ${i.label}</span>
        <div style="font-size:14px;color:#4b5563;margin-top:2px">${i.why}</div>
      </li>`
    )
    .join('');
  const mail = {
    subject: `${seller.businessName || 'Your shop'}: ${three.length} listing${three.length > 1 ? 's' : ''} to fix this week`,
    text: `${title}\n\n${three.map((i) => `- ${i.name}: ${i.label} - ${i.why}\n  ${SITE}/seller/products/${i.productId}`).join('\n')}${more > 0 ? `\n\n+${more} more in Products.` : ''}\n\nProducts: ${SITE}/seller/products`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:8px 4px;font-size:16px;line-height:1.6;color:#1f2937">
      <h2 style="font-size:20px;margin:0 0 6px 0;color:#111827">Listings to fix · लिस्टिंग ठीक करें</h2>
      <p style="margin:0 0 16px 0;color:#6b7280;font-size:14px">${escapeHtml(seller.businessName || 'Your shop')} on ShopMaster Pro. The three that cost the most, worst first.</p>
      <ol style="padding-left:20px;margin:0 0 16px 0">${li}</ol>
      ${more > 0 ? `<p style="margin:0 0 16px 0;color:#6b7280;font-size:14px">+${more} more - the Products page shows each one.</p>` : ''}
      <p style="margin:0 0 20px 0"><a href="${SITE}/seller/products" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:9px;font-weight:600">Open Products</a></p>
      <p style="font-size:13px;color:#9ca3af">Weekly, Thursday morning. Turn it off under Settings → Notifications → Growth.</p>
    </div>`,
  };
  return { title, body, mail };
};

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isRegistered = (s) => Boolean(s.application?.gstMode === 'gstin' || s.application?.gstin || s.gstNumber);

/**
 * @returns {Promise<{sellers:number, sent:number, clean:number, errors:number, issues:number, counts:Record<string,number>}>}
 */
const sweep = async ({ now = new Date() } = {}) => {
  const sellers = await Seller.find({ isApproved: true, status: { $ne: 'suspended' } }).select('userId businessName application.gstMode application.gstin gstNumber').lean();
  const tag = weekTag(now).replace('growth-', 'catalogue-');
  const totals = {};
  let sent = 0;
  let clean = 0;
  let errors = 0;
  let issueCount = 0;
  const perSeller = [];
  for (const seller of sellers) {
    try {
      const products = await Product.find({ sellerId: seller.userId, isActive: true, isDeleted: { $ne: true } }).select('name description images mrp price hsn gstRate variantGroupId').lean();
      const { issues, counts } = findings(products, { registered: isRegistered(seller) });
      for (const [k, n] of Object.entries(counts)) totals[k] = (totals[k] || 0) + n;
      issueCount += issues.length;
      if (!issues.length) {
        clean += 1;
        continue;
      }
      perSeller.push({ name: seller.businessName, issues: issues.length, products: products.length });
      const three = pickThree(issues);
      const { title, body, mail } = render(seller, three, new Set(issues.map((i) => i.productId)).size);
      await notifier.notify({ userId: seller.userId, role: 'seller', category: 'growth', title, body, url: '/seller/products', tag, mail });
      sent += 1;
    } catch (err) {
      errors += 1;
      console.error(`catalogue sweep for ${seller.businessName || seller._id} failed:`, err.message);
    }
  }
  if (issueCount) {
    const worst = perSeller.sort((a, b) => b.issues - a.issues).slice(0, 3).map((s) => `${s.name} ${s.issues}`).join(', ');
    await notifier.notifyAdmins({ category: 'growth', title: `Catalogue sweep: ${issueCount} issue${issueCount > 1 ? 's' : ''} across ${sent} shop${sent > 1 ? 's' : ''}`, body: `${Object.entries(totals).map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`).join(' · ')}${worst ? ` · most: ${worst}` : ''}`, url: '/admin/products', tag });
  }
  return { sellers: sellers.length, sent, clean, errors, issues: issueCount, counts: totals, tag };
};

module.exports = { sweep, findings, pickThree, render, CHECKS };
