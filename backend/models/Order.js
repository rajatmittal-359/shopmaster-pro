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

  // ---- Discount snapshot ---------------------------------------------------
  /**
   * Money taken off THIS line, and who paid for it.
   *
   * Snapshotted for the same reason the commission rate above is: a payout run
   * over this order next month has to reach the answer it reaches today,
   * whatever the coupon has since become or been deleted into.
   *
   *   seller    the seller funded it - their earning above is already reduced
   *   platform  the platform funded it out of commission - the seller's earning
   *             is UNTOUCHED, and the platform's own net on this line may well
   *             be negative
   *
   * See utils/discount.js for why those two are not interchangeable.
   */
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discountFundedBy: {
    type: String,
    enum: ['platform', 'seller', null],
    default: null
  },

  /**
   * A refund raised for THIS line alone.
   *
   * WHY IT IS HERE AND NOT ONLY ON THE ORDER
   *   Cancelling one item out of a multi-item order raises a PARTIAL refund at
   *   Razorpay. customerController already wrote `item.refundId` and
   *   `item.refundStatus` - but neither path existed on this schema, and
   *   Mongoose silently drops writes to unknown paths in strict mode. So the
   *   refund happened at the payment gateway and its id was thrown away on the
   *   floor: nothing tied that refund to this order, this item, or this
   *   customer.
   *
   *   That matters most when a refund FAILS. Razorpay says so in a
   *   refund.failed webhook, which arrives carrying a refund id - and with
   *   nothing to match it against, the money is stuck and nobody knows.
   *
   *   The code that writes these was correct all along. The schema was missing.
   */
  refundId: { type: String, default: null },
  refundStatus: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: null,
  },
  refundAmount: { type: Number, default: null },
  refundedAt: { type: Date, default: null },
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
     * Why the last attempt to book a courier failed.
     *
     * A failed booking used to exist only as a red toast in front of whoever
     * pressed the button. Nothing was written down, so nothing could chase it:
     * the order sat in 'processing' looking exactly like one nobody had got
     * round to yet, and the customer went on being told it was being prepared.
     *
     * That is how a flat Shiprocket wallet becomes invisible - bookings simply
     * stop at a moment nobody is watching. Kept here so the seller's screen,
     * the admin's queue and anyone reading the order later all see the same
     * thing. Cleared the moment a booking succeeds.
     */
    bookingFailedReason: { type: String, default: null },
    bookingFailedKind: { type: String, default: null },
    bookingFailedAt: { type: Date, default: null },
    bookingAttempts: { type: Number, default: 0 },

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

    /**
     * WHO said this parcel was delivered.
     *
     * WHY THIS EXISTS
     *   "Delivered" is the single most valuable claim in the system: it starts
     *   the return window, and the window closing is what releases the seller's
     *   money. It was recorded with no note of who said it, which meant a
     *   seller pressing a button and a courier scanning a parcel were
     *   indistinguishable afterwards - so a dispute had nothing to weigh.
     *
     *   Indian consumer forums decide these on evidence: courier logs, parcel
     *   weight, complaint history. Where the platform cannot show its working,
     *   the benefit of the doubt goes to the customer. This field is the start
     *   of that working.
     *
     *   'courier'  a tracking scan - the only party with no stake in the answer
     *   'customer' the customer confirmed receipt themselves
     *   'seller'   the seller's own word, used only where no courier was booked
     *   'auto'     nobody objected within the confirmation window
     *   'admin'    a human decided a dispute
     */
    deliveryConfirmedBy: {
      type: String,
      enum: ['courier', 'customer', 'seller', 'auto', 'admin'],
      default: null,
    },

    /**
     * A return in progress for this seller's parcel.
     *
     *   requested  the customer has asked; nothing has moved and no money has
     *              been refunded
     *   picked     a courier has collected it
     *   received   it is back with the seller - THIS is what pays the refund
     *   rejected   the seller or an admin refused it, with a reason
     *
     * Deliberately separate from `status`. A requested return must not make the
     * parcel 'returned': that is a claim, not a fact, and treating it as fact is
     * how a customer ends up holding both the goods and the money.
     */
    returnStage: {
      type: String,
      enum: ['requested', 'picked', 'received', 'rejected'],
      default: null,
    },
    returnRequestedAt: { type: Date, default: null },
    returnReason: { type: String, default: null },
    returnNote: { type: String, default: null },

    /**
     * What the customer asked for when they opened the return: their money
     * back, or the same item again.
     *
     * WHY IT IS RECORDED AT THE REQUEST AND NOT AT THE END
     *   The two settle completely differently - one moves money and the other
     *   moves goods - and the decision belongs to the customer, not to whoever
     *   happens to press the button when the parcel comes back. Left until
     *   settlement, a seller could refund a customer who wanted the item, or
     *   ship a replacement to somebody who wanted their money. Neither is
     *   correctable afterwards without a second return.
     *
     *   Null on returns opened before replacements existed. Those are refunds,
     *   which is what they were promised, and settleReturn treats a missing
     *   value as 'refund' rather than guessing.
     */
    returnResolution: {
      type: String,
      enum: ['refund', 'replacement'],
      default: null,
    },

    /**
     * The replacement, once the customer has asked for one.
     *
     *   due        the faulty item is back with the seller and a replacement
     *              is owed. No money has moved and none will.
     *   shipped    a courier is carrying the replacement
     *   delivered  it arrived, and the whole exchange is closed
     *
     * WHY THE SELLER'S MONEY DOES NOT MOVE UNTIL 'delivered'
     *   An exchange is not finished when the faulty item comes back - it is
     *   finished when the customer is holding a working one. Paying out at the
     *   first half would pay a seller for a sale the customer does not yet have
     *   anything to show for. payoutBlockedReason holds on this.
     */
    replacementStage: {
      type: String,
      enum: ['due', 'shipped', 'delivered'],
      default: null,
    },
    replacementDueAt: { type: Date, default: null },
    replacementBookedAt: { type: Date, default: null },
    replacementDeliveredAt: { type: Date, default: null },

    /**
     * The reverse shipment, once a courier has been booked to collect it.
     *
     * Kept apart from the forward `awb` on purpose: a return travels on its own
     * waybill, and overwriting the outbound one would lose the record of how
     * the goods got there in the first place - which is exactly what a dispute
     * about a return needs to read.
     */
    returnOrderId: { type: String, default: null },
    returnShipmentId: { type: String, default: null },
    returnAwb: { type: String, default: null },
    returnBookedAt: { type: Date, default: null },

    /**
     * Somebody says the record is wrong.
     *
     * Amazon's A-to-z works this way: the buyer raises it, the seller has 72
     * hours to answer with evidence, and the platform - not either side -
     * decides. While it is open the seller's money does not move, because money
     * that has left is money that cannot be brought back.
     */
    disputeStatus: {
      type: String,
      enum: ['open', 'resolved_customer', 'resolved_seller'],
      default: null,
    },
    disputeReason: { type: String, default: null },
    disputeRaisedAt: { type: Date, default: null },
    disputeResolvedAt: { type: Date, default: null },
    disputeResolution: { type: String, default: null },

    // Courier details for this seller's parcel.
    shippingProvider: {
      type: String,
      enum: ['none', 'shiprocket', 'borzo'],
      default: 'none',
    },
    awb: { type: String, default: null },
    courierName: { type: String, default: null },

    /**
     * The courier's own last word, kept verbatim.
     *
     * Our four states are a summary; a seller chasing a parcel needs what the
     * courier actually said - "Address issue - customer not available" is
     * actionable, "shipped" is not. Held per fulfilment because in a split
     * order the two parcels travel separately.
     */
    courierStatus: { type: String, default: null },
    courierStatusAt: { type: Date, default: null },

    /**
     * A failed delivery attempt. Deliberately not a fulfilment status: the
     * parcel has not moved backwards and the courier will try again, so
     * overwriting 'shipped' would lose where it actually is.
     */
    ndrReason: { type: String, default: null },
    ndrAt: { type: Date, default: null },

    /** How many times the courier has tried. Two failures is a real problem. */
    ndrAttempts: { type: Number, default: 0 },

    /**
     * The courier never COLLECTED it. A different failure from a failed
     * delivery, and one nothing was watching for: the seller thinks it has
     * gone, the customer is waiting, and the parcel is on a shelf.
     */
    nprReason: { type: String, default: null },

    /**
     * What this seller was charged for cancelling this order themselves,
     * beyond the monthly free allowance (config/sellerRules.js). Shown on
     * their order card; the ledger row is in SellerCharge.
     */
    cancelPenalty: { type: Number, default: 0 },

    /**
     * Proof of delivery - a signature or a photo, as the courier recorded it.
     *
     * This is the evidence an admin needs to settle "the tracking says
     * delivered but nothing arrived". Without it a dispute is one person's word
     * against another's, and Indian consumer forums give the benefit of the
     * doubt to the customer where the platform cannot show its working.
     *
     * It arrives with ordinary tracking - no special arrangement needed - but
     * only once a parcel has actually been delivered.
     */
    podUrl: { type: String, default: null },

    /**
     * When the courier expects to deliver it.
     *
     * Shiprocket sends this as `etd` on every tracking event and it was being
     * thrown away. It is the single thing a waiting customer most wants: "where
     * is it" is really "when will it come", and a page that answers only
     * "Shipped" answers neither.
     */
    expectedDeliveryAt: { type: Date, default: null },

    /**
     * The journey, as the courier recorded it.
     *
     * Also thrown away - the webhook carries a `scans` array of every stop.
     * Without it the customer sees one word and no sense of movement, which is
     * exactly when people start telephoning to ask.
     *
     * Newest first, capped: a long parcel can collect dozens of scans and the
     * older ones stop being interesting once it has arrived.
     */
    scans: [
      {
        _id: false,
        at: { type: Date },
        activity: { type: String },
        location: { type: String },
      },
    ],
    shipmentId: { type: String, default: null },
    shippingOrderId: { type: String, default: null },
    trackingUrl: { type: String, default: null },

    /**
     * Parcels that have already made this journey and are finished with.
     *
     * WHY THE CURRENT PARCEL KEEPS THE PLAIN FIELD NAMES
     *   An exchange sends a SECOND parcel to the same customer for the same
     *   fulfilment. Everything that watches a parcel move - the courier
     *   webhook, the reconciler, the tracking panel the customer refreshes -
     *   finds it by `awb`. Giving the replacement its own field name would mean
     *   teaching every one of those about a second place to look, and the one
     *   that was forgotten would go quiet without erroring: a replacement in
     *   transit that nothing was tracking.
     *
     *   So `awb` and the fields beside it always mean THE PARCEL ON ITS WAY TO
     *   THE CUSTOMER NOW, and the one it replaced is moved in here first.
     *   Nothing is lost - a dispute about an exchange needs to read both
     *   journeys - and nothing downstream changes.
     */
    previousParcels: [
      {
        _id: false,
        awb: { type: String },
        courierName: { type: String },
        shipmentId: { type: String },
        shippingOrderId: { type: String },
        trackingUrl: { type: String },
        deliveredAt: { type: Date },
        /** Why this parcel stopped being the current one. */
        replacedBecause: { type: String },
      },
    ],
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
     * Who cancelled, and why.
     *
     * All three can cancel and their reasons are not interchangeable: a
     * customer changed their mind, a seller could not supply, the platform
     * stepped in. Without this the order only records THAT it was cancelled,
     * so a seller who keeps cancelling for being out of stock is invisible -
     * and that is exactly the behaviour a marketplace has to be able to see.
     */
    cancelledBy: {
      type: String,
      enum: ['customer', 'seller', 'admin'],
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    cancellationReason: {
      type: String,
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

    /**
     * The code the customer used, and what it took off the whole basket.
     *
     * Kept on the order as well as apportioned onto the lines, because these
     * two answer different questions: the lines decide what each seller is
     * paid, and this decides what the customer's bill said. A receipt that
     * cannot show the discount it applied is a receipt somebody will dispute.
     *
     * The code is stored as text rather than a reference on purpose - a coupon
     * that is later edited or deleted must not change what this order says
     * happened.
     */
    couponCode: { type: String, default: null },
    discountAmount: { type: Number, default: 0, min: 0 },
    discountFundedBy: {
      type: String,
      enum: ['platform', 'seller', null],
      default: null,
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
