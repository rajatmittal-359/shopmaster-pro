const mongoose = require('mongoose');

/**
 * The words buyers type in a category, with how many of them there are.
 *
 * WHY THIS IS NOT A MODEL CALL, AND NOT AN ADS CALL (28 Sep 2026)
 *   The seller form asks for this the moment a category is chosen, before a
 *   single letter of the product name is typed. It has to be instant and it
 *   has to be free, because it is asked on every new listing and most of
 *   those sellers will never press "Suggest search words" at all.
 *
 *   So it is one indexed read of the weekly market brief. Keyword Planner
 *   was paid for once, last Monday, for the whole category (utils/ai/
 *   marketBrief); everybody selling in it reads that answer for nothing.
 *
 * A LEAF WITH NO BRIEF BORROWS ITS PARENT'S.
 *   Briefs are built for categories that have live products. The first
 *   seller in a brand-new leaf would otherwise get silence, which is the
 *   exact moment the coaching is worth most.
 *
 *   Today that fallback almost never fires, and it is worth saying why
 *   rather than leaving it to look like dead code: the tree is two deep, so
 *   every briefed category is a SIBLING of an empty one, not an ancestor -
 *   "Temple Jewellery" sits beside "Rings" under "Jewellery", and
 *   "Jewellery" itself holds no products and so has no brief. Borrowing
 *   sideways was considered and refused: ring words on a temple-jewellery
 *   listing are worse than no words. Such a category self-heals instead -
 *   the Monday job builds a brief for it as soon as it has one live
 *   product, and until then the field behaves exactly as it did before any
 *   of this existed.
 *
 * Returns [] rather than throwing, always: this decorates a form, it does
 * not gate one.
 */
const categoryWords = async (categoryId, { limit = 40 } = {}) => {
  if (!mongoose.isValidObjectId(categoryId)) return [];
  try {
    const Category = require('../models/Category');
    const MarketBrief = require('../models/MarketBrief');

    const cat = await Category.findById(categoryId).select('name slug parentCategory').lean();
    if (!cat) return [];

    const slugs = [cat.slug];
    if (cat.parentCategory) {
      const parent = await Category.findById(cat.parentCategory).select('slug').lean();
      if (parent?.slug) slugs.push(parent.slug);
    }

    // findOne over an $in preserves no order, so ask for the leaf first and
    // only fall back - a parent's words are a consolation, not an equal.
    let brief = null;
    for (const slug of slugs) {
      brief = await MarketBrief.findOne({ 'category.slug': slug }).select('words').lean();
      if (brief?.words?.length) break;
    }
    if (!brief?.words?.length) return [];

    return [...brief.words]
      .sort((a, b) => (b.monthly || 0) - (a.monthly || 0))
      .slice(0, limit)
      .map((w) => ({
        word: w.word,
        // Absent means Google reports it too rarely to count. It must stay
        // absent: a stored 0 reads as "nobody searches this".
        ...(w.monthly ? { monthly: w.monthly } : {}),
        ...(w.sources?.length ? { sources: w.sources } : {}),
      }));
  } catch {
    return [];
  }
};

module.exports = { categoryWords };
