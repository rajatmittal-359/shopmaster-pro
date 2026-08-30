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

  // ---- Commission snapshot -------------------------------------------------
  // Copied from the seller's profile at the moment the order is placed and then
  // never recalculated. A seller's rate can change tomorrow; what they are owed
  // for a sale made today must not. commissionAmount + sellerEarning always
  // equals price * quantity. See utils/commission.js.
  commissionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  commissionAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  sellerEarning: {
    type: Number,
    default: 0,
    min: 0
  },

  /**
   * The payout that has already paid this line to its seller.
   *
   * This is the claim that makes double-payment impossible: a payout only ever
   * takes lines where this is still null, in one conditional write. Without it
   * a payout would have to be inferred from date ranges, and two runs over
   * overlapping ranges would pay the same sale twice.
   */
  payoutId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payout',
    default: null,
    index: true
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

    /**
     * Human-readable reference, e.g. SMP-260830-A3F19C.
     *
     * Customers and couriers need something they can read out over the phone;
     * a raw ObjectId is not that. Derived from the _id, so it inherits the
     * _id's uniqueness and needs no counter collection. Set in pre-validate.
     */
    orderNumber: {
      type: String,
      unique: true,
      index: true
    },

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

    /**
     * Whether this order is currently holding inventory, and until when.
     *
     *   none      COD, or a prepaid order whose hold was never taken
     *   held      units are counted in Product.reserved for this order
     *   consumed  payment succeeded; the hold became a sale
     *   released  payment failed, was cancelled, or the hold expired
     *
     * Only 'held' blocks other customers. The status is moved with a
     * compare-and-set so a hold can never be released or consumed twice, which
     * is what stops a concurrent release and payment both touching stock.
     */
    reservationStatus: {
      type: String,
      enum: ['none', 'held', 'consumed', 'released'],
      default: 'none',
      index: true,
    },

    /**
     * When an unpaid hold stops blocking other customers.
     *
     * Expired holds are released lazily, at the moment another checkout tries
     * to reserve the same product - which is exactly when the units are needed
     * and the only time the staleness can matter. No scheduler is involved.
     */
    reservationExpiresAt: {
      type: Date,
      default: null,
    },

    /**
     * When the order actually reached the customer.
     *
     * Without this the return window cannot be computed at all: `status` only
     * says an order IS delivered, never WHEN, and updatedAt moves on every
     * later write. Set once, when status first becomes 'delivered'.
     */
    deliveredAt: {
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
      enum: ['none', 'shiprocket', 'borzo'],
      default: 'none',
    },

    /**
     * Which delivery speed the customer chose.
     *
     * 'same_day' orders go out by hyperlocal rider the same day and have a real
     * arrival time; 'standard' goes by courier over two to three days. Recorded
     * so the seller queue can show what was promised, not just what was paid.
     */
    deliveryOption: {
      type: String,
      enum: ['standard', 'same_day'],
      default: 'standard',
    },

    /** What the same-day courier promised at checkout. Null for standard. */
    deliveryPromisedBy: {
      type: Date,
      default: null,
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

/**
 * Build the readable order number once, before validation runs so the
 * `unique` constraint has a value to check. Mongoose assigns _id at document
 * construction, so it is already available here.
 */
orderSchema.pre('validate', function () {
  if (this.orderNumber) return;

  const d = this.createdAt ? new Date(this.createdAt) : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  this.orderNumber = `SMP-${yy}${mm}${dd}-${String(this._id).slice(-6).toUpperCase()}`;
});

// 📌 Indexes
orderSchema.index({ customerId: 1 });
orderSchema.index({ 'items.sellerId': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
