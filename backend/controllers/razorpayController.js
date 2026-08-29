const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");

const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const InventoryLog = require("../models/Inventory");
const Address = require("../models/Address");
const sendSafeEmail = require("../utils/sendSafeEmail");
const { orderConfirmedEmail } = require("../utils/emailTemplates");
const { getShippingRate } = require('../utils/shiprocketService'); // ✅ NEW IMPORT

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
  for (const item of order.items) {
    if (item.status === 'cancelled') continue;

    const productId = item.productId?._id || item.productId;

    const before = await Product.findOneAndUpdate(
      { _id: productId, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { session, new: false }
    );

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

    // 3) Stock validation
    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id).session(
        session
      );

      if (!product || !product.isActive) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Product ${item.productId.name} is no longer available`,
        });
      }

      if (product.stock < item.quantity) {
        console.log(
          `Stock insufficient: ${product.name} (Available: ${product.stock}, Requested: ${item.quantity})`
        );
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`,
        });
      }
    }

    // ✅ 3.5) Calculate shipping charges (NEW)
// ✅ 3.5) Calculate shipping charges (NEW)
let shippingCharges = 0;
let shippingCourier = null;

try {
  // Calculate total cart weight
  const totalWeight = cart.items.reduce((sum, item) => {
    return sum + (item.productId.weight || 0.5) * item.quantity;
  }, 0);

  // Get customer pincode from address
  const pincode = address.zipCode;

  // Razorpay orders are prepaid (not COD)
  const isCOD = false;

  // Call Shiprocket API
  const shippingData = await getShippingRate(pincode, totalWeight, isCOD);

  // ✅ FIXED: Correct path & field access
  const couriers = 
    shippingData?.data?.available_courier_companies || 
    shippingData?.available_courier_companies || 
    [];

  if (couriers.length > 0) {
    // Select cheapest courier
    const cheapest = couriers.reduce((min, curr) => {
      // ✅ Try multiple field names
      const currRate = curr.freight_charge || curr.rate || curr.total_charge || 0;
      const minRate = min.freight_charge || min.rate || min.total_charge || 0;
      return currRate < minRate ? curr : min;
    });

    // ✅ Get base shipping rate
    const baseRate = cheapest.freight_charge || cheapest.rate || cheapest.total_charge || 0;
    
    // ✅ COD charges (prepaid = 0)
    const codFee = 0; // Razorpay is prepaid, no COD charges

    shippingCharges = Math.round(baseRate + codFee);
    shippingCourier = cheapest.courier_name || cheapest.courier_company_id || 'Shiprocket';

    // ✅ DEBUG LOG
    console.log('📦 RAZORPAY SHIPPING:', {
      totalWeight,
      pincode,
      baseRate,
      codFee,
      total: shippingCharges,
      courier: shippingCourier
    });
  } else {
    // Fallback: Fixed ₹100 if API fails
    shippingCharges = 100;
    shippingCourier = 'Standard Shipping';
    console.warn('⚠️ Shiprocket: No couriers available - using fallback');
  }
} catch (shipErr) {
  console.error('Shipping calculation failed:', shipErr.message);
  // Fallback: Don't block checkout
  shippingCharges = 100;
  shippingCourier = 'Standard Shipping';
}


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

    // ✅ 6) Calculate total with shipping
    const finalAmount = cart.totalAmount + shippingCharges;

    // 7) Create Razorpay order
    const razorpayOrder = await getRazorpay().orders.create({
      amount: Math.round(finalAmount * 100), // ✅ CHANGED
      currency: "INR",
      receipt: `ord_${shortUserId}_${shortTimestamp}`,
    });

    // 8) Create DB order with razorpayOrderId
    const order = await Order.create(
      [
        {
          customerId: req.user.id,
          items: cart.items.map((item) => ({
            productId: item.productId._id,
            name: item.productId.name,
            quantity: item.quantity,
            price: item.price,
            sellerId: item.productId.sellerId,
          })),
          totalAmount: finalAmount, // ✅ CHANGED
          shippingAddressId,
          status: "pending",
          paymentMethod: "razorpay",
          paymentStatus: "pending",
          razorpayOrderId: razorpayOrder.id,
          // ✅ NEW SHIPPING FIELDS
          shippingCharges,
          shippingProvider: 'shiprocket',
          shippingCourierName: shippingCourier,
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
    console.log(
      "⚠️ Razorpay order creation failed, rolling back transaction. Raw error:",
      err
    );
    console.log(
      "⚠️ Razorpay order creation failed, error message:",
      err?.message
    );

    await session.abortTransaction();
    session.endSession();

    console.error("RAZORPAY ORDER ERROR (message):", err?.message);
    console.error("RAZORPAY ORDER ERROR (stack):", err?.stack);

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
      const { subject, html } = orderConfirmedEmail(order, { name: "Customer" });

      await sendSafeEmail({
        toUserId: customerId,
        subject,
        html,
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

    // ✅ NEW: Handle payment.captured event
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
        
        // ✅ Send order confirmation email (non-blocking)
        setImmediate(async () => {
          try {
            const User = require('../models/User');
            const customer = await User.findById(order.customerId);
            const { orderConfirmedEmail } = require('../utils/emailTemplates');
            const { subject, html } = orderConfirmedEmail(order, customer);
            const sendSafeEmail = require('../utils/sendSafeEmail');
            await sendSafeEmail({ toUserId: customer._id, subject, html });
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
    if (event === 'payment.failed') {
      console.log('Payment failed:', payload?.order_id);
      // Order remains "pending" - customer can retry
      return res.json({ status: 'ok' });
    }
    
    // Other events - ignore
    return res.json({ status: 'ok' });
    
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(500).json({ message: 'Webhook handling failed' });
  }
};
