// backend/models/Wishlist.js
const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const wishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: [wishlistItemSchema],
  },
  { timestamps: true }
);



/*
 * "How many people saved this?" - the per-product report asks it (28 Sep
 * 2026) and one document holds a whole shopper's list, so without this the
 * count walks every wishlist in the database. Cheap now with six accounts,
 * and the kind of thing that is never noticed until it is slow.
 */
wishlistSchema.index({ 'items.productId': 1 });

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

module.exports = Wishlist;
