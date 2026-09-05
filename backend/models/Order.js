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

/**
 * One seller's share of an order, and how far along it is.
 *
 * WHY THIS EXISTS
 *   An order can contain items from several sellers, but the order carried a
 *   single `status`. Any seller with an item in the basket could move that one
 *   field, so one seller marking their parcel "delivered" declared the WHOLE
 *   order delivered - including items another seller had not even packed. That
 *   set the order's deliveredAt, which starts the return window, which is what
 *   makes a line payable. A seller could therefore be paid for goods that had
 *   never left the shelf, and on COD the order was marked paid for money nobody
 *   had collected.
 *
 *   Each seller now owns exactly one fulfilment and can only ever move their
 *   own. The order's `status` is DERIVED from these (see deriveStatus) and kept
 *   stored, so everything that already reads order.status keeps working.
 *
 * Courier fields live here as well as on the order: in a split order the two
 * sellers ship separately and have different AWBs. The order-level shipping
 * fields are retained for single-seller orders and existing readers.
 */
const fulfilmentSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
      default: 'pending',
    },

    shippedAt: { type: Date, default: null },

    /**
     * When THIS seller's parcel reached the customer.
     *
     * The return window and therefore payout eligibility are measured from
     * here, per seller - not from the order, which in a split order says
     * nothing about when any particular seller delivered.
     */
    deliveredAt: { type: Date, default: null },

    /** When the customer started a return for this seller's parcel. */
    returnedAt: { type: Date, default: null },

    // Courier details for this seller's parcel.
    shippingProvider: {
      type: String,
      enum: ['none', 'shiprocket', 'borzo'],
      default: 'none',
    },
    awb: { type: String, default: null },
    courierName: { type: String, default: null },
    shipmentId: { type: String, default: null },
    shippingOrderId: { type: String, default: null },
    trackingUrl: { type: String, default: null },
  },
  { _id: false }
);

/**
 * How far along the whole order is, given its sellers' fulfilments.
 *
 * An order is only as advanced as its LEAST advanced live part: if one seller
 * has delivered and another has not packed, the customer's order is still
 * pending. Cancelled parts drop out of the reckoning; a returned part is
 * treated as finished so it cannot hold the order back, but an order whose
 * parts have ALL been returned is itself returned.
 */
const FULFILMENT_RANK = {
  pending: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
  returned: 3,
};
const RANK_TO_STATUS = ['pending', 'processing', 'shipped', 'delivered'];

const deriveStatus = (fulfilments = []) => {
  if (!fulfilments.length) return 'pending';

  const live = fulfilments.filter((f) => f.status !== 'cancelled');
  if (!live.length) return 'cancelled';
  if (live.every((f) => f.status === 'returned')) return 'returned';

  const minRank = live.reduce(
    (min, f) => Math.min(min, FULFILMENT_RANK[f.status] ?? 0),
    Infinity
  );
  return RANK_TO_STATUS[minRank] || 'pending';
};

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    items: [orderItemSchema],

    /**
     * One entry per seller in this order, built automatically from `items`.
     * See fulfilmentSchema above for why this exists.
     */
    fulfilments: [fulfilmentSchema],

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

    /**
     * How far the WHOLE order has got.
     *
     * DERIVED from `fulfilments` and written on every save - do not set it by
     * hand. A seller moves their own fulfilment; this follows. It stays a real
     * stored field so existing queries and screens keep working unchanged.
     */
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

/**
 * Give every seller in the basket exactly one fulfilment, and keep the order's
 * own status in step with them.
 *
 * Done in a hook rather than at the two call sites, so both checkout paths -
 * COD in customerController and prepaid in razorpayController - get this
 * without either having to remember. A seller that already has a fulfilment is
 * left untouched; only genuinely new sellers get one added.
 */
orderSchema.pre('validate', function () {
  const sellerIds = [...new Set((this.items || []).map((i) => String(i.sellerId)))];
  const existing = new Set((this.fulfilments || []).map((f) => String(f.sellerId)));

  sellerIds
    .filter((id) => !existing.has(id))
    .forEach((id) => this.fulfilments.push({ sellerId: id, status: 'pending' }));

  this.status = deriveStatus(this.fulfilments);

  // The order as a whole counts as delivered only once every seller has
  // delivered, so this is the moment the last parcel arrived.
  if (this.status === 'delivered' && !this.deliveredAt) {
    const times = this.fulfilments
      .filter((f) => f.deliveredAt)
      .map((f) => f.deliveredAt.getTime());
    this.deliveredAt = times.length ? new Date(Math.max(...times)) : new Date();
  }
});

/** This seller's slice of the order, or undefined if they are not in it. */
orderSchema.methods.fulfilmentFor = function (sellerId) {
  return this.fulfilments.find((f) => String(f.sellerId) === String(sellerId));
};

/** Exposed so payout and tests can reason about status without duplicating it. */
orderSchema.statics.deriveStatus = deriveStatus;
orderSchema.statics.FULFILMENT_RANK = FULFILMENT_RANK;

// 📌 Indexes
orderSchema.index({ customerId: 1 });
orderSchema.index({ 'items.sellerId': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });

// Payout asks "which of this seller's parcels were delivered long enough ago",
// which is a query over the fulfilment array, not the order's own status.
orderSchema.index({ 'fulfilments.sellerId': 1, 'fulfilments.status': 1 });
orderSchema.index({ 'fulfilments.deliveredAt': 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
