/**
 * The template glue between a product's category and config/listingTemplates
 * (21 Sep 2026): resolves the template for a category id (one small read,
 * parent included) and applies cleaned attributes to a product on create and
 * update. Kept out of the controller so the AI writer, the backfill job and
 * the seller routes all clean attributes the same way.
 */
const Category = require('../models/Category');
const { templateFor, cleanAttributes } = require('../config/listingTemplates');

/** Template for a category id (or document); general when unknown. */
const templateForCategoryId = async (categoryId) => {
  if (!categoryId) return templateFor(null);
  const cat = await Category.findById(categoryId).select('name parentCategory').populate('parentCategory', 'name').lean().catch(() => null);
  if (!cat) return templateFor(null);
  return templateFor({ name: cat.name, parent: cat.parentCategory ? { name: cat.parentCategory.name } : null });
};

/**
 * Write templateKey + cleaned attributes onto a product document. `raw`
 * undefined = leave attributes alone (a PATCH that did not touch them);
 * `{}` = clear. Always re-stamps templateKey from the current category so a
 * category change re-templates the listing.
 */
const applyAttributes = async (product, raw) => {
  const template = await templateForCategoryId(product.category);
  product.templateKey = template.key;
  if (raw !== undefined) {
    product.attributes = cleanAttributes(template, raw);
    if (product.markModified) product.markModified('attributes');
  }
  return template;
};

module.exports = { templateForCategoryId, applyAttributes };
