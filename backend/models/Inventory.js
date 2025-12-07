const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    type: {
      type: String,
      enum: ['sale', 'return', 'restock', 'adjustment'],
      required: true,
    },
quantity: {
  type: Number,
  required: true, // negative for sale, positive for return/restock
},
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    reason: {
      type: String,
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    stockBefore: {
      type: Number,
      required: true,
    },
    stockAfter: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

// Indexes
inventorySchema.index({ productId: 1 });
inventorySchema.index({ orderId: 1 });
inventorySchema.index({ createdAt: -1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;
