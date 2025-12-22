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

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

      if (shippingData && shippingData.available_courier_companies && shippingData.available_courier_companies.length > 0) {
        // Select cheapest courier
        const couriers = shippingData.available_courier_companies;
        const cheapest = couriers.reduce((min, curr) => 
          curr.rate < min.rate ? curr : min
        );

        shippingCharges = cheapest.rate;
        shippingCourier = cheapest.courier_name;
      } else {
        // Fallback: Fixed ₹100 if API fails
        shippingCharges = 100;
        shippingCourier = 'Standard Shipping';
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
    const razorpayOrder = await razorpay.orders.create({
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

    // 1) Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // 2) Fetch order
    const order = await Order.findById(dbOrderId)
      .populate("items.productId")
      .session(session);

    if (!order) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // 3) Update payment details
    order.paymentMethod = "razorpay";
    order.paymentStatus = "paid"; // optional: later rename to "completed"
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;

    await order.save({ session });

    // 4) Update stock + inventory logs
    for (const item of order.items) {
      const productDoc = await Product.findById(item.productId).session(
        session
      );
      const stockBefore = productDoc.stock;
      const stockAfter = stockBefore - item.quantity;

      productDoc.stock = stockAfter;
      await productDoc.save({ session });

      await InventoryLog.create(
        [
          {
            productId: item.productId,
            type: "sale",
            quantity: -item.quantity,
            stockBefore,
            stockAfter,
            orderId: order._id,
            performedBy: order.customerId,
          },
        ],
        { session }
      );
    }

    // 5) Clear cart
    await Cart.findOneAndUpdate(
      { userId: order.customerId },
      { items: [], totalAmount: 0 },
      { session }
    );

    await session.commitTransaction();

    // 6) Order confirmation email (non‑blocking)
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
    const razorpaySignature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');
    
    if (razorpaySignature !== expectedSignature) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }
    
    const event = req.body.event;
    const payload = req.body.payload.payment.entity;
    
    console.log('Razorpay webhook event:', event);
    
    // ✅ NEW: Handle payment.captured event
    if (event === 'payment.captured') {
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
        
        // ✅ Check if already processed (idempotency)
        if (order.paymentStatus === 'paid' || order.paymentStatus === 'completed') {
          console.log('Payment already processed for order:', order._id);
          await session.abortTransaction();
          return res.json({ status: 'already_processed' });
        }
        
        // ✅ Update payment details
        order.paymentMethod = 'razorpay';
        order.paymentStatus = 'paid';
        order.razorpayPaymentId = payload.id;
        order.razorpaySignature = 'webhook'; // Webhook doesn't provide signature
        await order.save({ session });
        
        // ✅ Update stock & inventory logs
        for (const item of order.items) {
          const productDoc = await Product.findById(item.productId._id).session(session);
          const stockBefore = productDoc.stock;
          const stockAfter = stockBefore - item.quantity;
          
          productDoc.stock = stockAfter;
          await productDoc.save({ session });
          
          await InventoryLog.create([{
            productId: item.productId._id,
            type: 'sale',
            quantity: -item.quantity,
            stockBefore,
            stockAfter,
            orderId: order._id,
            performedBy: order.customerId,
          }], { session });
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
      console.log('Payment failed:', payload.order_id);
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
