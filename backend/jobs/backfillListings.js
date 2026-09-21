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

/**
 * Two modes (22 Sep 2026):
 *   fill     only what is empty (the default; the seller's words stay theirs)
 *   rewrite  everything the writer produces - title (marketplace formula),
 *            description, highlights, material, attributes, product type,
 *            tags - because the first listings were typed in a hurry (Rajat:
 *            "jaldi jaldi me aadha-adhura daala, sab sahi kar do"). Price,
 *            stock, photos, category, SKU, weight are never touched. What was
 *            there before is kept in `aiFilled.before`, so a seller can put
 *            their own title back with one click.
 */
const backfill = async ({ max = 25, pauseMs = 4000, mode = 'fill', deps = {} } = {}) => {
  const rewrite = mode === 'rewrite';
  const filter = { isActive: true, isDeleted: { $ne: true } };
  if (!rewrite) filter.$or = [{ attributes: { $exists: false } }, { attributes: {} }, { attributes: null }];
  else if (!deps.again) filter['aiFilled.mode'] = { $ne: 'rewrite' };
  const todo = await Product.find(filter)
    .select('name description images category sellerId material highlights tags productType color aiFilled')
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
    const set = { templateKey: template.key, 'aiFilled.at': new Date(), 'aiFilled.mode': mode, 'aiFilled.fields': [] };
    const attrs = cleanAttributes(template, d.attributes);
    if (Object.keys(attrs).length) { set.attributes = attrs; set['aiFilled.fields'].push('attributes'); }
    if ((rewrite || !p.productType) && d.productType) { set.productType = d.productType; set['aiFilled.fields'].push('productType'); }
    if ((rewrite || !p.material) && d.material) { set.material = d.material.slice(0, 80); set['aiFilled.fields'].push('material'); }
    if ((rewrite || !(p.highlights || []).length) && (d.bullets || []).length) { set.highlights = d.bullets.slice(0, 5).map((b) => b.slice(0, 90)); set['aiFilled.fields'].push('highlights'); }
    const newTags = [...new Set([...(d.tags || []), ...(p.tags || [])])].slice(0, 20);
    if (newTags.length > (p.tags || []).length || rewrite) { set.tags = newTags; set['aiFilled.fields'].push('tags'); }
    if (rewrite) {
      // The seller's own words are kept beside the new ones, never lost.
      // The seller's ORIGINAL words, kept once: a second rewrite must not replace them with the first rewrite's.
      if (!p.aiFilled?.before?.name) set['aiFilled.before'] = { name: p.name, description: p.description || '', highlights: p.highlights || [] };
      if (d.name && d.name.split(' ').length >= 3) { set.name = d.name.slice(0, 120); set['aiFilled.fields'].push('name'); }
      if (d.description && d.description.length > 40) { set.description = d.description; set['aiFilled.fields'].push('description'); }
      if (d.color && !p.color) set.color = d.color.slice(0, 60);
    }
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
    const body = rewrite
      ? `${items.length} listing${items.length === 1 ? '' : 's'} were rewritten to marketplace standard - title, description, highlights and product facts, from the photos. Your earlier words are kept with each product - ask and they come back. Read each one once: a wrong fact becomes a return.${needs.length ? ` ${needs.length} still need a fact only you know.` : ''}`
      : `${items.length} listing${items.length === 1 ? '' : 's'} now carry their product facts (material, type, occasion and more), written from the photos.${needs.length ? ` ${needs.length} still need a fact only you know - open them under Products.` : ''} Check the facts once; a wrong fact becomes a return.`;
    await notify({ userId: sellerId, role: 'seller', category: 'catalogue', title: `Product facts filled on ${items.length} listing${items.length === 1 ? '' : 's'}`, body, url: '/seller/products', tag: `backfill-${sellerId}-${Date.now()}` }).catch(() => {});
  }

  return { filled, failed, pending: Math.max(0, todo.length - filled - failed), sellersTold: perSeller.size };
};

/**
 * Tags-only tidy (22 Sep 2026, no model): drop a template seed from a
 * product's tags when it does not name that product - the first rewrite
 * attached "kurti for women" to shirts and "power bank" to earbuds because
 * the category's first seeds were added to everything. Keeps the seller's
 * and the model's own words; removes only seeds that fail the same relevance
 * rule the writer now applies.
 */
const tidyTags = async () => {
  const { TEMPLATES } = require('../config/listingTemplates');
  const seedSet = new Set(Object.values(TEMPLATES).flatMap((t) => t.seoSeeds || []).map((x) => x.toLowerCase()));
  const skip = new Set(['women', 'girls', 'mens', 'set', 'with', 'wear', 'for']);
  const products = await Product.find({ isActive: true, isDeleted: { $ne: true } }).select('name productType description tags category').populate('category', 'name').lean();
  let changed = 0;
  for (const p of products) {
    const about = `${p.name} ${p.productType || ''} ${p.category?.name || ''} ${String(p.description || '').replace(/<[^>]+>/g, ' ')}`.toLowerCase();
    const tokens = new Set(about.match(/[a-z]{4,}/g) || []);
    const keep = (p.tags || []).filter((t) => {
      const tag = String(t).toLowerCase();
      if (!seedSet.has(tag)) return true; // the seller's or the model's own word
      return tag.split(/\s+/).some((w) => w.length >= 4 && !skip.has(w) && tokens.has(w));
    });
    if (keep.length !== (p.tags || []).length) {
      await Product.updateOne({ _id: p._id }, { $set: { tags: keep } });
      changed += 1;
    }
  }
  return { checked: products.length, changed };
};

module.exports = { backfill, tidyTags };
