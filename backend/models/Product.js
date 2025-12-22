// backend/models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
      default: 0,
    },
 weight: {
  type: Number,
  min: [0.1, 'Weight must be at least 0.1 kg'],
  max: [30, 'Weight cannot exceed 30 kg'],
}
,

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

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
