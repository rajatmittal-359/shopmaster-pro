const mongoose = require('mongoose');

/** URL-safe slug from a category name. */
const slugify = (name = '') =>
  String(name)
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [50, 'Category name cannot exceed 50 characters']
    },
    // Stable, URL-safe identifier. Sparse so pre-migration documents without a
    // slug do not collide on the unique index.
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      unique: true,
      sparse: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters']
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
     parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },

    /**
     * Materialized path: every ancestor from the root down to the direct parent.
     * Root categories have []. A subcategory of "Jewellery" has [jewelleryId].
     *
     * parentCategory alone can only answer "who is my parent"; answering
     * "everything beneath this category" required one query per level. With
     * ancestors indexed, that becomes a single query at any depth, which is what
     * makes a parent category behave as a container rather than a flat label.
     */
    ancestors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
  },
  {
    timestamps: true
  }
);

categorySchema.index({ ancestors: 1 });
categorySchema.index({ parentCategory: 1 });

/** Recompute ancestors for a given parent id. */
categorySchema.statics.buildAncestors = async function (parentCategoryId) {
  if (!parentCategoryId) return [];
  const parent = await this.findById(parentCategoryId).select('ancestors').lean();
  if (!parent) return [];
  return [...(parent.ancestors || []), parentCategoryId];
};

/** Slug helper exposed for scripts and controllers. */
categorySchema.statics.slugify = slugify;

/**
 * Ids of every category that is genuinely browsable: active itself AND with no
 * inactive ancestor. Deactivating a parent therefore hides its whole subtree,
 * which previously did not happen.
 *
 * Optionally scoped to one subtree via `rootId` (the category itself plus all
 * of its descendants) - this is the parent-rollup used by the shop filter.
 */
categorySchema.statics.getBrowsableIds = async function (rootId = null) {
  const all = await this.find({}, '_id isActive ancestors').lean();

  const activeById = new Map(all.map((c) => [String(c._id), c.isActive !== false]));
  const isBrowsable = (c) =>
    activeById.get(String(c._id)) &&
    (c.ancestors || []).every((a) => activeById.get(String(a)) !== false);

  let visible = all.filter(isBrowsable);

  if (rootId) {
    const root = String(rootId);
    visible = visible.filter(
      (c) => String(c._id) === root || (c.ancestors || []).some((a) => String(a) === root)
    );
  }

  return visible.map((c) => c._id);
};

/** True when the category has at least one child (i.e. is not a leaf). */
categorySchema.statics.hasChildren = function (categoryId) {
  return this.exists({ parentCategory: categoryId });
};

// Keep slug and ancestors correct on every write that goes through a document.
// Async middleware: Mongoose does not pass `next` here, matching User.js.
categorySchema.pre('save', async function () {
  if (this.isModified('name') || !this.slug) {
    this.slug = slugify(this.name);
  }
  if (this.isModified('parentCategory') || this.isNew) {
    this.ancestors = await this.constructor.buildAncestors(this.parentCategory);
  }
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
