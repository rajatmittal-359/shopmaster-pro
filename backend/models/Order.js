const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'cancelled'],
    default: 'active',
  },
});

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    items: [orderItemSchema],

    totalAmount: {
      type: Number,
      required: true
    },

    // 📦 Order fulfilment status
    status: {
      type: String,
      enum: [
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'returned'
      ],
      default: 'pending'
    },

    shippingAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Address',
      required: true
    },

    // 💳 PAYMENT (MINIMUM ESSENTIAL – FIXED)
    paymentMethod: {
      type: String,
      enum: ['cod', 'razorpay'],
      required: true
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },

    // 💠 Razorpay references (safe for COD as null)
    razorpayOrderId: {
      type: String,
      default: null
    },

    razorpayPaymentId: {
      type: String,
      default: null
    },

    razorpaySignature: {
      type: String,
      default: null
    },

    // 🔁 Refund readiness (structure only)
    refundId: {
      type: String,
      default: null
    },

    refundStatus: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: null
    },

    refundAmount: {
      type: Number,
      default: null
    },

    refundedAt: {
      type: Date,
      default: null
    },

    // 🚚 Manual tracking (existing flow)
    trackingInfo: {
      courierName: { type: String, default: null },
      trackingNumber: { type: String, default: null },
      shippedDate: { type: Date, default: null }
    },

    // 🚀 Shiprocket / external shipping integration (NEW FIELDS)
    shippingProvider: {
      type: String,
      enum: ['none', 'shiprocket'],
      default: 'none',
    },
    shippingCharges: {
      type: Number,
      default: 0,
    },
    shippingAwb: {
      type: String,
      default: null,
    },
    shippingCourierName: {
      type: String,
      default: null,
    },
    shippingShipmentId: {
      type: String,
      default: null, // Shiprocket shipment_id
    },
    shippingOrderId: {
      type: String,
      default: null, // Shiprocket order_id
    },
    shippingTrackingUrl: {
      type: String,
      default: null,
    }

  },
  {
    timestamps: true
  }
);

// 📌 Indexes
orderSchema.index({ customerId: 1 });
orderSchema.index({ 'items.sellerId': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
