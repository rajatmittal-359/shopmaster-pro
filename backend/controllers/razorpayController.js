const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");

const Order = require("../models/Order");
const { priceOrder, markCouponUsed } = require("../utils/priceOrder");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const InventoryLog = require("../models/Inventory");
const Address = require("../models/Address");
const sendSafeEmail = require("../utils/sendSafeEmail");
const { orderConfirmedEmail } = require("../utils/emailTemplates");
const { priceDeliveryOption } = require('../utils/shipping');
const {
  reserveForItems,
  releaseReservation,
  holdsInventory,
} = require('../utils/reservation');

// Lazily constructed: the Razorpay SDK throws when key_id is missing, so building
// the client at module load made this file impossible to require without live
// credentials (and crashed the server on a misconfigured deploy).
let _razorpay = null;
const getRazorpay = () => {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
};

/**
 * Atomically commit stock for a paid order, writing the audit trail as it goes.
 *
 * Previously each item did `read stock -> subtract -> save()`. Two problems:
 *   1. the read/write gap let a concurrent order take the same units, and
 *   2. going below zero tripped the schema's `min: 0` validator, which threw and
 *      aborted the whole transaction AFTER the customer had already paid.
 *
 * A conditional findOneAndUpdate with `stock: { $gte: qty }` decides and
 * decrements in one atomic operation, so it can never produce a negative value
 * and never throws. `new: false` returns the pre-image, supplying
 * stockBefore/stockAfter for the InventoryLog without a second read.
 *
 * Returns { ok: true } or { ok: false, shortfall: { name, requested } }.
 */
const commitStockForOrder = async (order, session) => {
  // A held order already owns its units, so the sale takes them out of BOTH
  // counters at once and cannot be beaten to them. An order without a hold
  // (COD, or a prepaid hold that expired before payment landed) falls back to
  // the plain conditional decrement, which is the behaviour that existed
  // before reservations and is still the honest outcome there.
  const consumesHold = holdsInventory(order);

  for (const item of order.items) {
    if (item.status === 'cancelled') continue;

    const productId = item.productId?._id || item.productId;

    const filter = consumesHold
      ? { _id: productId, stock: { $gte: item.quantity }, reserved: { $gte: item.quantity } }
      : { _id: productId, stock: { $gte: item.quantity } };

    const update = consumesHold
      ? { $inc: { stock: -item.quantity, reserved: -item.quantity } }
      : { $inc: { stock: -item.quantity } };

    const before = await Product.findOneAndUpdate(filter, update, {
      session,
      new: false,
    });

    if (!before) {
      return { ok: false, shortfall: { name: item.name, requested: item.quantity } };
    }

    await InventoryLog.create(
      [
        {
          productId,
          type: 'sale',
          quantity: -item.quantity,
          stockBefore: before.stock,
          stockAfter: before.stock - item.quantity,
          orderId: order._id,
          performedBy: order.customerId,
        },
      ],
      { session }
    );
  }

  // The hold has become a sale. Recorded so a later release can never hand
  // back units that have already been sold.
  if (consumesHold) {
    await Order.updateOne(
      { _id: order._id, reservationStatus: 'held' },
      { $set: { reservationStatus: 'consumed', reservationExpiresAt: null } },
      { session }
    );
    order.reservationStatus = 'consumed';
  }

  return { ok: true };
};

/**
 * Record a captured payment on an order that could NOT be fulfilled.
 *
 * The customer's money has been taken, so the payment must be recorded even
 * though the order cannot ship. `paid` + `cancelled` with no refundStatus is the
 * existing schema's way of saying "money in, order dead, refund owed" - no new
 * states are introduced. Runs outside the aborted transaction, and is itself a
 * compare-and-set so a retry cannot double-apply it.
 */
const recordUnfulfillablePayment = async (orderId, paymentId, signature) =>
  Order.updateOne(
    { _id: orderId, paymentStatus: 'pending' },
    {
      $set: {
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        status: 'cancelled',
      },
    }
  );

// Constant-time comparison that is safe for attacker-controlled input:
// timingSafeEqual throws when the buffers differ in length, so length is
// checked first and a non-string signature can never reach it.
const safeEqualHex = (expected, provided) => {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

// =======================
// Create Razorpay Order
// =======================
exports.createRazorpayOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { shippingAddressId } = req.body;

    // 1) Validate shipping address
    const address = await Address.findOne({
      _id: shippingAddressId,
      userId: req.user.id,
    }).session(session);

    if (!address) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Invalid shipping address" });
    }

    // 2) Load cart
    const cart = await Cart.findOne({ userId: req.user.id })
      .populate("items.productId")
      .session(session);

    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Cart is empty" });
    }

    // 3) RESERVE the inventory rather than merely checking it.
    //
    // Checking was the old behaviour and it could not prevent anything: two
    // customers both read "1 in stock", both paid, and only one could be
    // fulfilled. Holding the units means the second customer is turned away
    // BEFORE any money moves. All-or-nothing across the basket.
    const reservation = await reserveForItems(
      cart.items.map((item) => ({
        productId: item.productId._id,
        quantity: item.quantity,
        name: item.productId.name,
      })),
      session
    );

    if (!reservation.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        success: false,
        message:
          reservation.shortfall.available > 0
            ? `Only ${reservation.shortfall.available} unit(s) of "${reservation.shortfall.name}" are still available.`
            : `"${reservation.shortfall.name}" is no longer available.`,
        productName: reservation.shortfall.name,
        available: reservation.shortfall.available,
      });
    }

    // Delivery is priced by the shared module so this path and the COD path can
    // never diverge, and so free-shipping products are honoured here too.
    // Razorpay orders are prepaid, hence isCOD = false. The option id comes
    // from the browser but the PRICE is always re-quoted here.
    const {
      shippingCharges,
      shippingCourier,
      shippingProvider,
      deliveryOption,
      arrivalBy,
    } = await priceDeliveryOption(cart.items, address, false, req.body.deliveryOption);


    // 4) Env check
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message: "Payment gateway not configured",
      });
    }

    // 5) Short receipt ID (max 40 chars)
    const shortUserId = String(req.user.id).slice(-8);
    const shortTimestamp = Date.now().toString().slice(-8);

    /*
     * 6) Price the order BEFORE asking Razorpay for anything.
     *
     * The gateway is told an amount and that amount is what the customer's card
     * is charged. Working the discount out afterwards - which is what the first
     * cut of this did - would have taken full price at the till and recorded a
     * discounted order, so the books and the bank would disagree on every
     * couponed sale.
     *
     * Same single pricing path as COD: commission and any discount, snapshotted
     * onto every line. See utils/priceOrder.js.
     */
    const { orderItems, itemsTotal, discountTotal, coupon, couponError } =
      await priceOrder({
        items: cart.items,
        couponCode: req.body.couponCode,
        customerId: req.user.id,
        session,
      });

    // A refused code stops the checkout. Charging someone full price after they
    // typed a code, and letting them find out on the receipt, is not an option.
    if (couponError) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: couponError });
    }

    // Goods, less the discount, plus delivery. Delivery is never discounted -
    // it is money owed to a courier, not margin.
    const finalAmount =
      Math.round((Math.max(0, itemsTotal - discountTotal) + shippingCharges) * 100) / 100;

    // 7) Create the Razorpay order for exactly that amount
    const razorpayOrder = await getRazorpay().orders.create({
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      receipt: `ord_${shortUserId}_${shortTimestamp}`,
    });

    const order = await Order.create(
      [
        {
          customerId: req.user.id,
          items: orderItems,
          totalAmount: finalAmount,
          couponCode: coupon?.code || null,
          discountAmount: discountTotal,
          discountFundedBy: coupon?.fundedBy || null,
          shippingAddressId,
          status: "pending",
          paymentMethod: "razorpay",
          paymentStatus: "pending",
          razorpayOrderId: razorpayOrder.id,
          // The units this order is holding, and until when.
          reservationStatus: 'held',
          reservationExpiresAt: reservation.expiresAt,
          shippingCharges,
          shippingProvider,
          shippingCourierName: shippingCourier,
          deliveryOption,
          deliveryPromisedBy: arrivalBy,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    console.log(
      `Razorpay order created successfully: ${razorpayOrder.id} for user ${req.user.id}`
    );

    return res.json({
      success: true,
      orderId: razorpayOrder.id, // Razorpay order id
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      dbOrderId: order[0]._id,   // internal DB order id
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error('Razorpay order creation failed, rolled back:', err?.message);
    if (process.env.NODE_ENV !== 'production') console.error(err?.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error:
        process.env.NODE_ENV === "development"
          ? err?.message || "Unknown error"
          : undefined,
    });
  }
};


// =======================
// Verify Razorpay Payment
// =======================
exports.verifyRazorpayPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      dbOrderId,
    } = req.body;

    // 1) Required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !dbOrderId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Missing payment verification details",
      });
    }

    if (!mongoose.isValidObjectId(dbOrderId)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    // 2) Load the order scoped to the AUTHENTICATED customer.
    // Scoping here (rather than findById) stops one customer confirming
    // payment against another customer's order.
    const order = await Order.findOne({
      _id: dbOrderId,
      customerId: req.user._id,
    })
      .populate("items.productId")
      .session(session);

    if (!order) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // 3) Bind the payment to the Razorpay order this DB order was created with.
    // Without this, a valid signature from ANY of the customer's payments could
    // be redirected at any other pending order.
    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpay_order_id) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Payment does not belong to this order",
      });
    }

    // 4) Idempotency: a confirmed order is never processed twice. This must run
    // before any stock mutation so a replayed callback cannot double-decrement.
    if (order.paymentStatus === "paid") {
      await session.abortTransaction();
      return res.json({
        success: true,
        alreadyProcessed: true,
        message: "Payment already verified for this order",
        order,
      });
    }

    if (order.paymentStatus === "refunded") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Order has already been refunded",
      });
    }

    // 5) Verify the signature using the SERVER-STORED razorpay order id, never
    // the browser-supplied one, so the HMAC itself carries the binding.
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(order.razorpayOrderId + "|" + razorpay_payment_id)
      .digest("hex");

    if (!safeEqualHex(expectedSignature, razorpay_signature)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // 6) Claim the order with a compare-and-set. Step 4 is a fast path; this is
    // the race-safe one. Two concurrent verifications cannot both match
    // `paymentStatus: 'pending'`, so only one can proceed to commit stock.
    const claim = await Order.updateOne(
      { _id: order._id, paymentStatus: "pending" },
      {
        $set: {
          paymentMethod: "razorpay",
          paymentStatus: "paid",
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
        },
      },
      { session }
    );

    if (claim.modifiedCount === 0) {
      await session.abortTransaction();
      session.endSession();
      const current = await Order.findById(order._id);
      return res.json({
        success: true,
        alreadyProcessed: true,
        message: "Payment already verified for this order",
        order: current,
      });
    }

    /*
     * Spend the coupon use now that the money is actually in.
     *
     * Not at checkout: the prepaid order is created BEFORE payment, so counting
     * there would burn a use every time somebody opened the Razorpay dialog and
     * closed it - and a campaign would run out on people who never bought
     * anything. It sits after the compare-and-set claim above, so a replayed
     * verification cannot spend a second use either.
     */
    if (order.couponCode) {
      await markCouponUsed(order.couponCode, order.customerId, session);
    }

    // 7) Commit stock atomically. Never throws, never goes negative.
    const stockResult = await commitStockForOrder(order, session);

    if (!stockResult.ok) {
      // The customer HAS paid but the order cannot be fulfilled. Roll the whole
      // commitment back, then record the captured payment separately so the
      // money is never silently lost.
      await session.abortTransaction();
      session.endSession();

      await recordUnfulfillablePayment(
        order._id,
        razorpay_payment_id,
        razorpay_signature
      );

      console.error(
        `PAYMENT CAPTURED BUT UNFULFILLABLE - order ${order._id}, ` +
          `insufficient stock for "${stockResult.shortfall.name}"`
      );

      return res.status(409).json({
        success: false,
        paymentCaptured: true,
        refundRequired: true,
        orderId: order._id,
        message: `Your payment was received, but "${stockResult.shortfall.name}" sold out before the order could be confirmed. The order has been cancelled and your payment will be refunded.`,
      });
    }

    // 8) Clear cart
    await Cart.findOneAndUpdate(
      { userId: order.customerId },
      { items: [], totalAmount: 0 },
      { session }
    );

    await session.commitTransaction();

    // Reflect the committed state in the response payload.
    order.paymentMethod = "razorpay";
    order.paymentStatus = "paid";
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;

    // 9) Order confirmation email (non‑blocking)
    try {
      const customerId = order.customerId;
      // Looked up rather than hardcoded: the mail opens "Hi {name}", and this
      // path was greeting every customer as "Hi Customer".
      const User = require('../models/User');
      const customer = (await User.findById(customerId)) || { name: 'there' };
      const { subject, html, text } = orderConfirmedEmail(order, customer);

      await sendSafeEmail({
        toUserId: customerId,
        subject,
        html,
        text,
      });
    } catch (e) {
      console.error("Order confirmation email failed:", e.message);
    }

    session.endSession();

    return res.json({
      success: true,
      message: "Payment verified successfully",
      order,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("PAYMENT VERIFY ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =======================
// Razorpay Webhook (stub)
// =======================
// Razorpay Webhook - Auto-confirm payments on network failure
exports.handleRazorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('Webhook secret not configured');
      return res.status(500).json({ message: 'Webhook not configured' });
    }

    // The route is mounted with express.raw(), so req.body is the ORIGINAL
    // request bytes. Razorpay signs those bytes; re-serializing a parsed object
    // does not reproduce them, which is why verification previously never passed.
    const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    if (!rawBody) {
      console.error('Webhook raw body unavailable - check middleware order');
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    const razorpaySignature = req.headers['x-razorpay-signature'];

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (!safeEqualHex(expectedSignature, razorpaySignature)) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    // Only parse AFTER the signature is proven valid.
    let parsed;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch (parseErr) {
      return res.status(400).json({ message: 'Malformed webhook payload' });
    }

    const event = parsed?.event;
    // Guarded: non-payment events (refund.*, order.*) have no payment entity and
    // previously threw a TypeError here.
    const payload = parsed?.payload?.payment?.entity;

    console.log('Razorpay webhook event:', event);

    if (event === 'payment.captured') {
      if (!payload || !payload.order_id) {
        console.warn('payment.captured without a payment entity - ignoring');
        return res.json({ status: 'ignored' });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Find order by razorpayOrderId
        const order = await Order.findOne({ 
          razorpayOrderId: payload.order_id 
        })
        .populate('items.productId')
        .session(session);
        
        if (!order) {
          console.error('Order not found for razorpayOrderId:', payload.order_id);
          await session.abortTransaction();
          return res.json({ status: 'order_not_found' });
        }
        
        // ✅ Check if already processed (idempotency).
        // 'refunded' is included so a replayed capture cannot re-sell a
        // refunded order. 'completed' is not a member of the paymentStatus
        // enum and was never reachable.
        if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
          console.log('Payment already processed for order:', order._id);
          await session.abortTransaction();
          return res.json({ status: 'already_processed' });
        }
        
        // ✅ Claim with a compare-and-set, same as the verify path. Razorpay
        // retries webhooks, so this must be safe to receive more than once.
        const claim = await Order.updateOne(
          { _id: order._id, paymentStatus: 'pending' },
          {
            $set: {
              paymentMethod: 'razorpay',
              paymentStatus: 'paid',
              razorpayPaymentId: payload.id,
              razorpaySignature: 'webhook', // Webhook doesn't provide signature
            },
          },
          { session }
        );

        if (claim.modifiedCount === 0) {
          await session.abortTransaction();
          return res.json({ status: 'already_processed' });
        }

        // ✅ Same atomic stock commitment as the verify path. Without this the
        // webhook kept the original read-then-write decrement and could still
        // abort after capture.
        const stockResult = await commitStockForOrder(order, session);

        if (!stockResult.ok) {
          await session.abortTransaction();

          await recordUnfulfillablePayment(order._id, payload.id, 'webhook');

          console.error(
            `WEBHOOK: payment captured but unfulfillable - order ${order._id}, ` +
              `insufficient stock for "${stockResult.shortfall.name}"`
          );

          // 200 so Razorpay stops retrying; the state is recorded.
          return res.json({ status: 'captured_unfulfillable', orderId: order._id });
        }

        // ✅ Clear cart
        await Cart.findOneAndUpdate(
          { userId: order.customerId },
          { items: [], totalAmount: 0 },
          { session }
        );
        
        await session.commitTransaction();
        
        /*
         * The confirmation email.
         *
         * `order` was loaded BEFORE the claim above, and that claim was an
         * updateOne - it changed the database, not this object. So the copy
         * held here still said paymentStatus 'pending', and the mail went out
         * announcing "Payment: PENDING" for an order that had just been paid
         * for. A customer who has been charged reads that as their money
         * having failed.
         *
         * The order is re-read so the mail describes what was actually stored.
         */
        setImmediate(async () => {
          try {
            const User = require('../models/User');
            const customer = await User.findById(order.customerId);
            const fresh = await Order.findById(order._id);
            const { orderConfirmedEmail } = require('../utils/emailTemplates');
            const { subject, html, text } = orderConfirmedEmail(
              fresh || order,
              customer
            );
            const sendSafeEmail = require('../utils/sendSafeEmail');
            await sendSafeEmail({ toUserId: customer._id, subject, html, text });
          } catch (e) {
            console.error('Webhook order email failed:', e.message);
          }
        });
        
        console.log('✅ Webhook: Payment confirmed for order', order._id);
        return res.json({ status: 'ok' });
        
      } catch (err) {
        await session.abortTransaction();
        console.error('Webhook processing error:', err.message);
        return res.status(500).json({ message: 'Processing failed' });
      } finally {
        session.endSession();
      }
    }
    
    // ✅ Handle payment.failed event
    //
    // This is the only definitive failure signal the application actually
    // receives from Razorpay, so it is the only one acted on. The order stays
    // 'pending' - the customer may still retry - but the units it was holding
    // go back on sale immediately rather than waiting out the expiry window.
    if (event === 'payment.failed') {
      const failedOrderId = payload?.order_id;
      console.log('Payment failed:', failedOrderId);

      if (failedOrderId) {
        try {
          const order = await Order.findOne({ razorpayOrderId: failedOrderId });

          // Only an unpaid order may give its units back. A paid order has
          // already converted its hold into a sale, and releasing there would
          // hand back stock that has been sold.
          if (order && order.paymentStatus === 'pending') {
            const released = await releaseReservation(order);
            if (released) {
              console.log('Released reservation for failed payment on order', order._id);
            }
          }
        } catch (releaseErr) {
          // Never fail the webhook over this: the expiry sweep is the backstop.
          console.error('Failed to release reservation:', releaseErr.message);
        }
      }

      return res.json({ status: 'ok' });
    }
    
    /*
     * A refund finished, one way or the other.
     *
     * WHY THIS MATTERS MORE THAN IT LOOKS
     *   Every refund path in this codebase - a cancellation, a received return,
     *   an admin settling a dispute - sets refundStatus to 'processing' and
     *   then stops. Nothing ever moved it on. The enum has had 'completed' and
     *   'failed' since the field was written and nothing has ever set either.
     *
     *   So the customer's order page said "refund processing" for ever, long
     *   after the money had arrived. And when a refund FAILED at Razorpay -
     *   a closed account, a bank rejection - nobody found out at all. The
     *   customer's money was stuck and the only record said it was on its way.
     *
     *   This is the only signal Razorpay sends about a refund's fate.
     *
     * MATCHED ON THE REFUND ID, at either level
     *   A whole-order refund is stored on the order; a single cancelled line
     *   raises a PARTIAL refund stored on that item. Both are looked up,
     *   because either can be the one that failed.
     */
    if (event === 'refund.processed' || event === 'refund.failed') {
      const refund = parsed?.payload?.refund?.entity;

      if (!refund?.id) {
        console.warn(event, 'without a refund entity - ignoring');
        return res.json({ status: 'ignored' });
      }

      const done = event === 'refund.processed' ? 'completed' : 'failed';

      const order = await Order.findOne({
        $or: [{ refundId: refund.id }, { 'items.refundId': refund.id }],
      });

      if (!order) {
        /*
         * Not ours, or raised by hand in the Razorpay dashboard. Answered 200
         * on purpose: a non-2xx makes Razorpay retry for 24 hours and then
         * DISABLE the webhook, which would cost us every future payment
         * notification over a refund we never made.
         */
        console.warn('No order found for refund', refund.id, '- ignoring');
        return res.json({ status: 'ignored' });
      }

      const now = new Date();

      if (order.refundId === refund.id) {
        order.refundStatus = done;
        if (done === 'completed') order.refundedAt = now;
      }

      for (const item of order.items) {
        if (item.refundId === refund.id) {
          item.refundStatus = done;
          if (done === 'completed') item.refundedAt = now;
        }
      }

      await order.save();

      /*
       * A failed refund is money the customer is owed and is not getting, and
       * no screen shows it yet. Logged loudly so it is at least findable until
       * the admin dispute screen surfaces it.
       */
      if (done === 'failed') {
        console.error(
          `REFUND FAILED on order ${order.orderNumber} - refund ${refund.id},` +
            ` RS ${(refund.amount || 0) / 100}. The customer has NOT been paid.`
        );
      } else {
        console.log(`Refund ${refund.id} completed for order ${order.orderNumber}`);
      }

      return res.json({ status: 'ok' });
    }

    // Other events - ignore
    return res.json({ status: 'ok' });
    
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(500).json({ message: 'Webhook handling failed' });
  }
};
