const mongoose = require('mongoose');

/**
 * A seller asking for a category that does not exist.
 *
 * Amazon, Flipkart and Meesho keep the taxonomy in the platform's hands -
 * a seller picks a leaf, never creates one, because two sellers naming the
 * same thing two ways breaks browsing and Google both. What the seller CAN
 * do is ask. The admin sees the request on the Categories page and either
 * creates it (one click, under the parent the seller suggested) or says why
 * not; the seller sees the answer in their product form.
 */
const categoryRequestSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    note: { type: String, trim: true, maxlength: 300, default: null },
    status: { type: String, enum: ['open', 'created', 'declined'], default: 'open', index: true },
    reply: { type: String, trim: true, maxlength: 300, default: null },
    createdCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CategoryRequest', categoryRequestSchema);
