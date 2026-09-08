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
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @returns {{filter: object} | {notFound: true} | {empty: true}}
 *   `notFound` means the category slug does not exist - a 404, not an empty
 *   page. Answering 200 with zero products creates a soft 404, which Google
 *   indexes as real content.
 */
async function buildCatalogueFilter({ category, search, minPrice, maxPrice, color, size, minRating }) {
  const filter = { isActive: true, stock: { $gt: 0 } };

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
    const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [
      { name: searchRegex },
      { description: searchRegex },
      { brand: searchRegex },
      { tags: searchRegex },
    ];
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
    filter.color = { $regex: `^${escapeRegex(String(color).trim())}$`, $options: 'i' };
  }

  /*
   * Size is matched whole and case-insensitively, like colour: "M" must not
   * drag in "XM" or "Medium", and "38" must not match "38.5". It is escaped
   * because it arrives from the URL - and sizes genuinely contain characters a
   * regex cares about, like "8.5" and "M/L".
   */
  if (size) {
    filter.size = { $regex: `^${escapeRegex(String(size).trim())}$`, $options: 'i' };
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
