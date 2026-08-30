// backend/models/Product.js
const mongoose = require('mongoose');

/** URL-safe slug from a product name. Same rules as Category.slugify. */
const slugify = (name = '') =>
  String(name)
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    // Drop apostrophes rather than treating them as separators, so
    // "Women's Footwear" becomes womens-footwear and not women-s-footwear.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const productSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /**
     * Human-readable URL segment, e.g. "rose-gold-pearl-floral-ring-a1b2c3".
     * Product URLs were raw ObjectIds, which carry no keywords for search and
     * no meaning for a shopper reading the link. The short id suffix keeps it
     * unique without a lookup, the way Flipkart appends an item id.
     *
     * sparse so documents predating the backfill do not collide on the index.
     */
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [3, 'Product name must be at least 3 characters'],
      maxlength: [100, 'Product name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    stock: {
      type: Number,
      required: [true, 'Stock is required'],
      min: [0, 'Stock cannot be negative'],
      // Units on a shelf come in whole numbers. Half a ring is not a thing
      // that can be reserved, sold, or shipped, and stock - reserved stops
      // being an answer once either side is fractional.
      validate: {
        validator: Number.isInteger,
        message: 'Stock must be a whole number',
      },
      default: 0,
    },
    /**
     * Units promised to prepaid orders that have not been paid for yet.
     *
     * THE INVARIANT, and the only one that matters here:
     *
     *     stock     = physical units on hand
     *     reserved  = units held for unpaid prepaid checkouts
     *     available = stock - reserved   <- all a new checkout may draw from
     *
     * `stock` keeps its original meaning, so nothing that reads it breaks.
     * Reserving moves nothing out of `stock`; it only raises `reserved`.
     * A completed payment lowers BOTH by the same amount, converting the hold
     * into a sale. A failed, cancelled or expired checkout lowers `reserved`
     * alone. There is therefore exactly one decrement of `stock` per unit sold
     * and never a double-decrement.
     *
     * See utils/reservation.js for the lifecycle.
     */
    reserved: {
      type: Number,
      default: 0,
      min: [0, 'Reserved units cannot be negative'],
    },

    /**
     * The seller absorbs the delivery cost for this product.
     *
     * Set per product so it can be used as a real merchandising lever: a hero
     * item, a slow mover, or anything whose margin can carry the freight. The
     * courier still charges us - the customer simply is not billed for it.
     *
     * In a mixed basket only the items that are NOT free-shipping are counted
     * towards the billable weight, so a free-shipping item genuinely rides
     * along at the seller's expense. See utils/shipping.js.
     */
    freeShipping: {
      type: Boolean,
      default: false,
    },

    /**
     * Shipping weight in kilograms.
     *
     * The floor used to be 0.1 kg, which is 100 g - heavier than most of the
     * jewellery sold here. A 4 g ring had to be recorded as 0.1 kg, and the
     * courier is quoted on that inflated figure, so every small order was
     * being over-charged. 1 g is the real practical minimum.
     */
    weight: {
      type: Number,
      min: [0.001, 'Weight must be at least 0.001 kg (1 g)'],
      max: [30, 'Weight cannot exceed 30 kg'],
    },

    images: {
      type: [String],
      validate: {
        validator: function (arr) {
          return arr.length <= 5;
        },
        message: 'Maximum 5 images allowed',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
    },

    // ✅ Reviews summary
    avgRating: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
      brand: {
    type: String,
    trim: true,
  },
  sku: {
    type: String,
    trim: true,
  },
  mrp: {
    type: Number,
  },
  tags: [
    {
      type: String,
      trim: true,
    },
  ],
  },
  {
    timestamps: true,
  }
);

// Virtual field for low stock alert
productSchema.virtual('isLowStock').get(function () {
  return this.stock <= this.lowStockThreshold;
});

// Indexes
productSchema.index({ sellerId: 1 });
productSchema.index({ category: 1 });
productSchema.index({ name: 'text', description: 'text' });

// Optional: sort by rating use case
productSchema.index({ avgRating: -1 });

productSchema.statics.slugify = slugify;

/** Build the URL slug: name plus a short id suffix that guarantees uniqueness. */
productSchema.statics.buildSlug = function (name, id) {
  const base = slugify(name) || 'product';
  return `${base}-${String(id).slice(-6)}`;
};

// Keep the slug in step with the name. Async middleware receives no `next`.
productSchema.pre('save', async function () {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.constructor.buildSlug(this.name, this._id);
  }
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
