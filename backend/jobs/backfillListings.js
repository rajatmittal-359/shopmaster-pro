/**
 * Fill the facts on listings that predate the category templates
 * (21 Sep 2026). Rajat: "tum hi bhar do, abhi products zyada nahi hain."
 *
 * For every live product with no attributes yet: run the same writer the
 * seller's "Write it for me" uses, on the product's main photo, name and
 * category, with the category's template. Then fill ONLY what is empty -
 * attributes, productType, material, highlights, and search words the
 * seller had not added. The seller's own title and description are never
 * touched: those are theirs. Everything filled is recorded on the product
 * (`aiFilled`) and the seller gets one bell listing what to check.
 *
 * Paced for the free Gemini tier; resumable (skips products already
 * filled); at most `max` products per run (default 25).
 */
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const { draftListing } = require('../utils/ai/listing');
const { templateForCategoryId } = require('../utils/listingTemplate');
const { cleanAttributes, missingRequired } = require('../config/listingTemplates');

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

const backfill = async ({ max = 25, pauseMs = 4000, deps = {} } = {}) => {
  const todo = await Product.find({
    isActive: true,
    isDeleted: { $ne: true },
    $or: [{ attributes: { $exists: false } }, { attributes: {} }, { attributes: null }],
  })
    .select('name description images category sellerId material highlights tags productType')
    .populate('category', 'name')
    .limit(max)
    .lean();
  if (!todo.length) return { filled: 0, note: 'every live listing already has its facts' };

  const perSeller = new Map();
  let filled = 0;
  let failed = 0;
  for (const p of todo) {
    const template = await templateForCategoryId(p.category?._id);
    const r = await draftListing(
      {
        name: p.name,
        keywords: (p.tags || []).join(' '),
        categoryName: p.category?.name,
        categoryOptions: p.category?.name ? [p.category.name] : [],
        imageUrl: p.images?.[0],
        template,
        textModel: 'auto',
      },
      deps.draft ? { generate: deps.draft } : undefined
    ).catch((e) => ({ ok: false, reason: e.message }));
    await pause(pauseMs);
    if (!r.ok) {
      failed += 1;
      console.warn(`backfill: ${p.name.slice(0, 40)} - ${r.reason}`);
      if (/quota|429/i.test(r.reason)) break;
      continue;
    }
    const d = r.draft;
    const set = { templateKey: template.key, 'aiFilled.at': new Date(), 'aiFilled.fields': [] };
    const attrs = cleanAttributes(template, d.attributes);
    if (Object.keys(attrs).length) { set.attributes = attrs; set['aiFilled.fields'].push('attributes'); }
    if (!p.productType && d.productType) { set.productType = d.productType; set['aiFilled.fields'].push('productType'); }
    if (!p.material && d.material) { set.material = d.material.slice(0, 80); set['aiFilled.fields'].push('material'); }
    if (!(p.highlights || []).length && (d.bullets || []).length) { set.highlights = d.bullets.slice(0, 5).map((b) => b.slice(0, 90)); set['aiFilled.fields'].push('highlights'); }
    const newTags = [...new Set([...(p.tags || []), ...(d.tags || [])])].slice(0, 20);
    if (newTags.length > (p.tags || []).length) { set.tags = newTags; set['aiFilled.fields'].push('tags'); }
    // A product whose category yields no attributes still gets its templateKey, so it is not retried forever.
    if (!set.attributes) set.attributes = {};
    await Product.updateOne({ _id: p._id }, { $set: set });
    filled += 1;
    const missing = missingRequired(template, attrs);
    const list = perSeller.get(String(p.sellerId)) || [];
    list.push({ name: p.name, filled: set['aiFilled.fields'], missing });
    perSeller.set(String(p.sellerId), list);
  }

  // One bell per seller: what was filled, what still needs their hand.
  const { notify } = require('../utils/notify');
  for (const [sellerId, items] of perSeller) {
    const seller = await Seller.findOne({ userId: sellerId }).select('userId').lean().catch(() => null);
    if (!seller) continue;
    const needs = items.filter((i) => i.missing.length);
    const body = `${items.length} listing${items.length === 1 ? '' : 's'} now carry their product facts (material, type, occasion and more), written from the photos.${needs.length ? ` ${needs.length} still need a fact only you know - open them under Products.` : ''} Check the facts once; a wrong fact becomes a return.`;
    await notify({ userId: sellerId, role: 'seller', category: 'catalogue', title: `Product facts filled on ${items.length} listing${items.length === 1 ? '' : 's'}`, body, url: '/seller/products', tag: `backfill-${sellerId}-${Date.now()}` }).catch(() => {});
  }

  return { filled, failed, pending: Math.max(0, todo.length - filled - failed), sellersTold: perSeller.size };
};

module.exports = { backfill };
