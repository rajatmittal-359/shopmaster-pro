/**
 * One definition of "which products a shopper can see".
 *
 * WHY IT LEFT THE ROUTE FILE
 *   Two endpoints need it: the listing, and the filter panel that has to say
 *   which colours and what price range exist WITHIN the current selection. If
 *   they build the query separately they drift, and the drift shows up as a
 *   colour offered in the sidebar that returns nothing when clicked - or worse,
 *   a filter panel counting products the listing refuses to show.
 */
const mongoose = require('mongoose');
const Category = require('../models/Category');

/** A user's text becomes part of a regex. Escape it or they own the query. */
const { withoutHiddenSellers } = require('./hiddenSellers');

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @returns {{filter: object} | {notFound: true} | {empty: true}}
 *   `notFound` means the category slug does not exist - a 404, not an empty
 *   page. Answering 200 with zero products creates a soft 404, which Google
 *   indexes as real content.
 */
async function buildCatalogueFilter({ category, search, minPrice, maxPrice, color, size, minRating, attrs }) {
  const filter = { isActive: true, stock: { $gt: 0 } };
  await withoutHiddenSellers(filter);

  if (category) {
    let categoryId = category;
    if (!mongoose.isValidObjectId(category)) {
      const bySlug = await Category.findOne({ slug: category }).select('_id').lean();
      if (!bySlug) return { notFound: true };
      categoryId = bySlug._id;
    }
    const categoryIds = await Category.getBrowsableIds(categoryId);
    if (categoryIds.length === 0) return { empty: true };
    filter.category = { $in: categoryIds };
  } else {
    filter.category = { $in: await Category.getBrowsableIds() };
  }

  if (search) {
    // Atlas Search when it answers (typos, Hinglish, prefixes - utils/atlasSearch);
    // the regex it always was when it does not. `searchIds` travels back so
    // the list can keep relevance order.
    const { searchProductIds } = require('./atlasSearch');
    const { expandQuery } = require('./searchSynonyms');
    // Hinglish and Hindi words widened to the English the listings use
    // (jhumka → earrings, lal → red), the original words first.
    let ids = await searchProductIds(expandQuery(search), { limit: 200 });
    if (ids && ids.length < 6) {
      // Few or no text matches: ask the vectors what the query MEANS
      // ("chhoti ladki ke liye gift"). Text matches keep their place at the top.
      const { semanticSearchIds } = require('./productVectors');
      const near = await semanticSearchIds(search, { k: 24 });
      const seen = new Set(ids);
      for (const n of near) if (!seen.has(n.id)) ids.push(n.id);
    }
    if (ids) {
      filter._id = { $in: ids };
      filter.__searchIds = ids;
    } else {
      const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { brand: searchRegex },
        { tags: searchRegex },
      ];
    }
  }

  /*
   * The category's own facts (config/listingTemplates, S3): `attrs` is a map
   * of attribute key → value or comma-list ("plating=Gold Plated",
   * "stoneType=Kundan,Pearl"), matched whole and case-insensitively like
   * colour. Keys are plain identifiers only - anything else from the URL is
   * ignored, never turned into a Mongo path.
   */
  if (attrs && typeof attrs === 'object') {
    for (const [key, raw] of Object.entries(attrs)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key)) continue;
      const wanted = String(raw || '').split(',').map((v) => v.trim()).filter(Boolean).slice(0, 8);
      if (!wanted.length) continue;
      filter[`attributes.${key}`] =
        wanted.length > 1
          ? { $in: wanted.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) }
          : { $regex: `^${escapeRegex(wanted[0])}$`, $options: 'i' };
    }
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  /*
   * Colour is matched whole and case-insensitively, never as a substring:
   * "Gold" must not drag in "Rose Gold", which is a different piece to anyone
   * shopping for one. The value is escaped because it arrives from the URL.
   */
  if (color) {
    // Several colours arrive comma-separated ("Gold,Red" - the panel is a
    // real multi-select); one colour stays the single anchored regex the
    // tests pin down, so the two shapes never drift apart.
    const wanted = String(color).split(',').map((c) => c.trim()).filter(Boolean);
    /*
     * A product may now hold up to three colours in Google's own shape -
     * "Red/Green/Black", one primary and two secondary (answer/6324487). So a
     * shopper asking for Red must match the whole field OR any slash-separated
     * part of it, while "Gold" still must not drag in "Rose Gold": the part is
     * anchored between the string's ends and the slashes around it.
     */
    const one = (c) => new RegExp(`(^|/)${escapeRegex(c)}(/|$)`, 'i');
    filter.color = wanted.length > 1 ? { $in: wanted.map(one) } : one(wanted[0] || '');
  }

  /*
   * Size is matched whole and case-insensitively, like colour: "M" must not
   * drag in "XM" or "Medium", and "38" must not match "38.5". It is escaped
   * because it arrives from the URL - and sizes genuinely contain characters a
   * regex cares about, like "8.5" and "M/L".
   */
  if (size) {
    const wanted = String(size).split(',').map((c) => c.trim()).filter(Boolean);
    filter.size =
      wanted.length > 1
        ? { $in: wanted.map((c) => new RegExp(`^${escapeRegex(c)}$`, 'i')) }
        : { $regex: `^${escapeRegex(wanted[0] || '')}$`, $options: 'i' };
  }

  /*
   * Rating is the biggest filter gap in the industry - 45% of shoppers treat
   * reviews as a key factor and only 47% of sites offer it. Anything outside
   * 1-5 is ignored rather than refused: a bad number in a URL should not be an
   * error page.
   */
  const rating = Number(minRating);
  if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
    filter.avgRating = { $gte: rating };
  }

  return { filter };
}

module.exports = { buildCatalogueFilter, escapeRegex };
