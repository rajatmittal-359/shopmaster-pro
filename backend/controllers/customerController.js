const Cart = require("../models/Cart");
const Order = require("../models/Order");
const { applyCommission } = require("../utils/commission");
const {
  calculateShipping,
  getDeliveryOptions,
  priceDeliveryOption,
} = require("../utils/shipping");
const { releaseReservation } = require("../utils/reservation");
// The same constant payout settles against, so the promise made to the customer
// and the moment a seller's money is released can never drift apart.
const { RETURN_WINDOW_DAYS } = require("../utils/payout");
const Product = require("../models/Product");
const mongoose = require('mongoose'); 
const Address = require('../models/Address'); 
const { applyInventoryChange } = require("./inventoryController");
const InventoryLog = require("../models/Inventory");

// Imported as a module object rather than destructured so the Shiprocket call
// stays late-bound: destructuring captured the function reference at load time,
// which made this third-party boundary impossible to stub in tests.
const shiprocketService = require('../utils/shiprocketService');


const sendSafeEmail = require('../utils/sendSafeEmail');
const { orderConfirmedEmail } = require('../utils/emailTemplates');

/**
 * Validate a client-supplied cart quantity at the request boundary.
 * Without this, bad input reached Mongoose and surfaced as a 500 with raw
 * schema paths ("Cast to Number failed for value \"abc\""), and a missing
 * quantity produced a NaN cart total.
 * Returns { ok: true, value } or { ok: false, message }.
 */
const parseQuantity = (raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, message: 'Quantity is required' };
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { ok: false, message: 'Quantity must be a number' };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, message: 'Quantity must be a valid number' };
  }
  if (!Number.isInteger(value)) {
    return { ok: false, message: 'Quantity must be a whole number' };
  }
  if (value < 1) {
    return { ok: false, message: 'Quantity must be at least 1' };
  }
  return { ok: true, value };
};


  exports.addToCart = async (req, res) => {
    try {
      const { productId, quantity } = req.body;

      if (!productId || !mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ message: "A valid productId is required" });
      }

      const parsed = parseQuantity(quantity);
      if (!parsed.ok) {
        return res.status(400).json({ message: parsed.message });
      }

      let cart = await Cart.findOne({ userId: req.user._id });

      if (!cart) {
        cart = await Cart.create({
          userId: req.user._id,
          items: [],
          totalAmount: 0,
        });
      }

      const product = await Product.findById(productId);

      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not available" });
      }

      const itemIndex = cart.items.findIndex(
        (i) => i.productId.toString() === productId
      );

      // Repeated adds compound, so the stock ceiling is checked against the
      // resulting quantity, not just the increment.
      const existingQty = itemIndex > -1 ? cart.items[itemIndex].quantity : 0;
      const requestedQty = existingQty + parsed.value;

      if (requestedQty > product.stock) {
        return res.status(400).json({
          message:
            product.stock > 0
              ? `Only ${product.stock} unit(s) available. Your cart already has ${existingQty}.`
              : `${product.name} is out of stock`,
          availableStock: product.stock,
          inCart: existingQty,
        });
      }

      if (itemIndex > -1) {
        cart.items[itemIndex].quantity = requestedQty;
      } else {
        cart.items.push({
          productId,
          quantity: parsed.value,
          price: product.price,
        });
      }

      cart.totalAmount = cart.items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0
      );

      await cart.save();
      res.json({ success: true, cart });

    } catch (err) {
      console.error("ADD TO CART ERROR:", err.message);
      res.status(500).json({ message: err.message });
    }
  };


  exports.getCart = async (req, res) => {
    try {
      const cart = await Cart.findOne({ userId: req.user._id })
        .populate("items.productId");

      if (!cart) {
        return res.json({
          success: true,
          cart: { items: [], totalAmount: 0 },
        });
      }

      res.json({ success: true, cart });

    } catch (err) {
      console.error("GET CART ERROR:", err.message);
      res.status(500).json({ message: err.message });
    }
  };

exports.checkout = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { shippingAddressId } = req.body;

    // ✅ Validate address
    const address = await Address.findOne({
      _id: shippingAddressId,
      userId: req.user._id,
    }).session(session);

    if (!address) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Invalid shipping address. Please select a valid address.',
      });
    }

    const cart = await Cart.findOne({ userId: req.user._id })
      .populate('items.productId')
      .session(session);

    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Cart is empty' });
    }

    // ✅ Stock validation
    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id).session(
        session
      );

      if (!product || !product.isActive) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Product ${item.productId.name} is no longer available`,
        });
      }

      // Units already held for an unpaid prepaid checkout are not on sale.
      // Without this a COD order would eat a unit that a paying customer is
      // mid-checkout for, and that customer's payment would then be
      // unfulfillable - the exact failure this phase removes.
      const available = product.stock - (product.reserved || 0);

      if (available < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Insufficient stock for ${product.name}. Available: ${Math.max(0, available)}`,
        });
      }
    }

    // Shipping for the COD endpoint is always priced with COD logic.
    // It previously read req.body.paymentMethod, which the client never sends
    // to /checkout-cod, so isCOD was false and the COD fee was silently dropped.
    // The browser sends an option id, never a price - it is re-quoted here so a
    // tampered request cannot choose what the customer pays for delivery.
    const {
      shippingCharges,
      shippingCourier,
      shippingProvider,
      deliveryOption,
      arrivalBy,
    } = await priceDeliveryOption(cart.items, address, true, req.body.deliveryOption);


    // ✅ Create order
    // Stamp platform commission onto each line before the order is written. The rate is
    const orderItems = await applyCommission(
      cart.items.map((item) => ({
        productId: item.productId._id,
        name: item.productId.name,
        quantity: item.quantity,
        price: item.price,
        sellerId: item.productId.sellerId,
      })),
      session
    );

    const order = await Order.create(
      [
        {
          customerId: req.user._id,
          items: orderItems,
          totalAmount: cart.totalAmount + shippingCharges,
          shippingAddressId,
          status: 'pending',
          paymentStatus: 'pending',
          paymentMethod: 'cod',
          shippingCharges,
          shippingProvider,
          shippingCourierName: shippingCourier,
          deliveryOption,
          deliveryPromisedBy: arrivalBy,
        },
      ],
      { session }
    );

    // ✅ Update stock + inventory logs
    //
    // COD keeps its original architecture: the sale is final at order creation,
    // so stock is decremented here rather than reserved. The decrement is now a
    // single conditional update instead of read-then-write, so two COD orders
    // for the last unit cannot both succeed, and it subtracts against
    // (stock - reserved) so it cannot take a unit a prepaid checkout is holding.
    for (const item of cart.items) {
      const before = await Product.findOneAndUpdate(
        {
          _id: item.productId._id,
          $expr: {
            $gte: [
              { $subtract: ['$stock', { $ifNull: ['$reserved', 0] }] },
              item.quantity,
            ],
          },
        },
        { $inc: { stock: -item.quantity } },
        { session, new: false }
      );

      if (!before) {
        await session.abortTransaction();
        return res.status(409).json({
          message: `"${item.productId.name}" sold out while your order was being placed.`,
        });
      }

      const stockBefore = before.stock;
      const stockAfter = stockBefore - item.quantity;

      await InventoryLog.create(
        [
          {
            productId: item.productId._id,
            type: 'sale',
            quantity: -item.quantity,
            stockBefore,
            stockAfter,
            orderId: order[0]._id,
            performedBy: req.user._id,
          },
        ],
        { session }
      );
    }

    // ✅ Clear cart
    cart.items = [];
    cart.totalAmount = 0;
    await cart.save({ session });

    // ✅ Commit DB transaction
    await session.commitTransaction();

    // 🔥 Immediate response
    res.status(201).json({
      success: true,
      order: order[0],
    });

    // 🔁 Background email
    setImmediate(async () => {
      try {
        const customer = req.user;
        const { subject, html } = orderConfirmedEmail(order[0], customer);

        await sendSafeEmail({
          toUserId: customer._id,
          toEmail: customer.email,
          subject,
          html,
        });
      } catch (emailErr) {
        console.error('COD order email failed:', emailErr.message);
      }
    });
  } catch (err) {
    await session.abortTransaction();
    console.error('CHECKOUT ERROR:', err.message);
    res.status(500).json({
      message: err.message || 'Checkout failed. Please try again.',
    });
  } finally {
    session.endSession();
  }
};

// CUSTOMER - Get my orders (list)
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("shippingAddressId"); // ✅ ADD THIS

    res.json({ success: true, orders });
  } catch (err) {
    console.error("GET MY ORDERS ERROR", err.message);
    res.status(500).json({ message: err.message });
  }
};



// backend/controllers/customerController.js

// CUSTOMER - Get single order details
exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customerId: req.user._id,
    }).populate("shippingAddressId"); // ✅ IMPORTANT

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("GET ORDER DETAILS ERROR", err.message);
    res.status(500).json({ message: err.message });
  }
};


 
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customerId: req.user.id,
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Status validation
    if (!['pending', 'processing'].includes(order.status)) {
      return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    // ✅ FIX #2: COD delivered order protection
    // 'paid' is the state the seller sets on COD delivery; 'completed' is not a
    // member of the paymentStatus enum, so this guard never fired.
    if (order.paymentMethod === 'cod' && order.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: "COD order already delivered and payment collected. Cannot cancel. Please use Return option if needed."
      });
    }

    // Cancel every seller's part. order.status is DERIVED from these on save,
    // so setting it directly here would simply be overwritten.
    order.fulfilments.forEach((f) => {
      if (!['delivered', 'returned'].includes(f.status)) f.status = 'cancelled';
    });

    // Refund logic for captured prepaid payments.
    // Previously guarded on 'completed', which the schema does not allow, so no
    // refund was ever initiated for a prepaid cancellation.
    if (order.paymentStatus === 'paid' && order.paymentMethod === 'razorpay') {
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      try {
        if (order.razorpayPaymentId) {
          const refundAmount = order.totalAmount;
          const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
            amount: Math.round(refundAmount * 100),
            speed: 'normal',
          });
          order.refundId = refund.id;
          order.refundStatus = 'processing';
          order.refundAmount = refundAmount;
          order.refundedAt = new Date();
          // Terminal payment state. Also keeps the order out of revenue
          // aggregations, which previously relied on zeroing totalAmount.
          order.paymentStatus = 'refunded';
          console.log("Refund initiated:", refund.id);
        }
      } catch (refundErr) {
        console.error("Refund failed", refundErr.message);
        // ✅ FIX #1: Stop cancellation if refund fails
        return res.status(500).json({
          success: false,
          message: "Refund initiation failed. Please contact support. Your payment is safe.",
          error: refundErr.message,
          orderId: order._id
        });
      }
    }

    // Restore inventory
    for (const item of order.items) {
      if (item.status === 'active') {
        await applyInventoryChange({
          productId: item.productId,
          quantity: item.quantity,
          type: 'return',
          orderId: order._id,
          performedBy: req.user.id,
        });
        item.status = 'cancelled';
      }
    }

    // NOTE: totalAmount is deliberately preserved. It previously was set to 0,
    // which destroyed the order's financial history. Cancelled orders are kept
    // out of revenue reporting by paymentStatus, not by erasing the amount.
    await order.save();

    res.json({ success: true, message: "Order cancelled", order });
  } catch (err) {
    console.error("CANCEL ORDER ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};


exports.cancelOrderItem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { orderId, itemId } = req.params;
    const order = await Order.findOne({ 
      _id: orderId, 
      customerId: req.user._id 
    }).session(session);
    
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Order not found' });
    }
    
    if (!['pending', 'processing'].includes(order.status)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Items can be cancelled only for pending/processing orders' 
      });
    }
    
    const item = order.items.id(itemId);
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Order item not found' });
    }
    
    if (item.status === 'cancelled') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Item already cancelled' });
    }
    
    const refundAmount = item.price * item.quantity;
    
    // Give the units back - but only if this order ever took them.
    //
    // A prepaid order that has not been paid for never decremented stock; it
    // only holds units. Restocking it inflated inventory out of nothing: a
    // product with one unit became two after a single abandoned checkout.
    // Releasing the hold is the correct undo, and it writes no inventory log
    // because nothing permanent changed.
    const consumedStock =
      order.paymentMethod === 'cod' || order.reservationStatus === 'consumed';

    if (consumedStock) {
      const product = await Product.findById(item.productId).session(session);
      const stockBefore = product.stock;
      product.stock += item.quantity;
      await product.save({ session });

      await InventoryLog.create([{
        productId: item.productId,
        type: 'return',
        quantity: item.quantity,
        stockBefore,
        stockAfter: product.stock,
        orderId: order._id,
        performedBy: req.user._id,
      }], { session });
    } else if (order.reservationStatus === 'held') {
      await releaseReservation(order, session);
    }
    
    if (order.paymentStatus === 'paid' && order.razorpayPaymentId) {
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
      
      try {
        const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
          amount: Math.round(refundAmount * 100), // Partial refund
          speed: 'normal',
        });
        
        // Store refund info (you may want to track per-item refunds)
        item.refundId = refund.id;
        item.refundStatus = 'processing';
        console.log(`Partial refund initiated: ${refund.id} for ₹${refundAmount}`);
      } catch (refundErr) {
        console.error('Partial refund failed:', refundErr.message);
        // Continue with cancellation even if refund fails
        // Admin can manually refund from Razorpay dashboard
      }
    }
    
    // Then update order
    item.status = 'cancelled';
    order.totalAmount -= refundAmount;
    if (order.totalAmount < 0) order.totalAmount = 0;
    
    // A seller whose every line has been cancelled has nothing left to send,
    // so their fulfilment is cancelled too. Once all of them are, the order
    // derives to 'cancelled' on its own.
    order.fulfilments.forEach((f) => {
      const theirs = order.items.filter(
        (it) => String(it.sellerId) === String(f.sellerId)
      );
      if (theirs.length && theirs.every((it) => it.status === 'cancelled')) {
        f.status = 'cancelled';
      }
    });
    
    await order.save({ session });
    await session.commitTransaction();
    
    res.json({ 
      success: true, 
      message: 'Order item cancelled', 
      refundAmount: order.paymentStatus === 'paid' ? refundAmount : null,
      order 
    });
  } catch (refundErr) {
  console.error("Partial refund failed", refundErr.message);
  // ✅ FIX: Stop item cancellation if refund fails
  await session.abortTransaction();
  return res.status(500).json({
    success: false,
    message: "Partial refund initiation failed. Please contact support.",
    error: refundErr.message,
    orderId: order._id,
    itemId: itemId
  });
}
 finally {
    session.endSession();
  }
};


  exports.returnOrder = async (req, res) => {
    try {
      const order = await Order.findOne({
        _id: req.params.orderId,
        customerId: req.user._id,
      });

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status !== "delivered") {
        return res.status(400).json({
          message: "Only delivered orders can be returned",
        });
      }

      // The return window has to be enforced HERE, because the rest of the
      // system is built on the promise that it closes. utils/payout.js pays a
      // seller once their delivery is older than RETURN_WINDOW_DAYS, on the
      // stated assumption that it can no longer come back. Without this check
      // an order delivered six months ago could still be returned: the
      // customer is refunded in full, the seller was paid long ago, no clawback
      // exists, and the platform absorbs the whole loss.
      const windowClosesAt = new Date(
        new Date(order.deliveredAt || order.updatedAt).getTime() +
          RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );
      if (Date.now() > windowClosesAt.getTime()) {
        return res.status(400).json({
          message: `The ${RETURN_WINDOW_DAYS}-day return window for this order closed on ${windowClosesAt.toDateString()}.`,
          returnWindowDays: RETURN_WINDOW_DAYS,
          windowClosedAt: windowClosesAt,
        });
      }

      // Mark every delivered part as returned; the order derives to 'returned'
      // once they all are.
      const returnedAt = new Date();
      order.fulfilments.forEach((f) => {
        if (f.status === 'delivered') {
          f.status = 'returned';
          f.returnedAt = returnedAt;
        }
      });

// Initiate refund for returned prepaid orders.
// Previously guarded on 'completed', which the paymentStatus enum does not
// allow, so a returned prepaid order was never refunded.
if (order.paymentStatus === 'paid' && order.paymentMethod === 'razorpay') {
  const Razorpay = require('razorpay');
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    if (order.razorpayPaymentId) {  // ✅ CORRECT - Payment ID
      const refundAmount = order.totalAmount;
      const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
        amount: Math.round(refundAmount * 100),
        speed: 'normal',
      });
      order.refundId = refund.id;
      order.refundStatus = 'processing';
      order.refundAmount = refundAmount;
      order.refundedAt = new Date();
      order.paymentStatus = 'refunded';
      console.log('Return refund initiated', refund.id);
    }
  } catch (refundErr) {
  console.error("Return refund failed", refundErr.message);
  // ✅ FIX: Stop return if refund fails
  return res.status(500).json({
    success: false,
    message: "Refund initiation failed for return. Please contact support.",
    error: refundErr.message,
    orderId: order._id
  });
}

}



      await order.save();

      for (const item of order.items) {
        await applyInventoryChange({
          productId: item.productId,
          quantity: item.quantity,
          type: "return", 
          orderId: order._id,
          performedBy: req.user._id,
        });
      }

      res.json({ success: true, message: "Order returned", order });

    } catch (err) {
      console.error("RETURN ORDER ERROR:", err.message);
      res.status(500).json({ message: err.message });
    }
  };

  exports.updateCartItem = async (req, res) => {
    try {
      const { productId, quantity } = req.body;

      if (!productId || !mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ message: "A valid productId is required" });
      }

      const parsed = parseQuantity(quantity);
      if (!parsed.ok) {
        return res.status(400).json({ message: parsed.message });
      }

      const cart = await Cart.findOne({ userId: req.user._id });

      if (!cart) return res.status(404).json({ message: "Cart not found" });

      const item = cart.items.find(
        (i) => i.productId.toString() === productId
      );

      if (!item) return res.status(404).json({ message: "Item not found" });

      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not available" });
      }

      if (parsed.value > product.stock) {
        return res.status(400).json({
          message:
            product.stock > 0
              ? `Only ${product.stock} unit(s) available`
              : `${product.name} is out of stock`,
          availableStock: product.stock,
        });
      }

      item.quantity = parsed.value;

      cart.totalAmount = cart.items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0
      );

      await cart.save();
      res.json({ success: true, cart });

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };

  exports.removeFromCart = async (req, res) => {
    try {
      const { productId } = req.params;

      const cart = await Cart.findOne({ userId: req.user._id });

      if (!cart) return res.status(404).json({ message: "Cart not found" });

      cart.items = cart.items.filter(
        (i) => i.productId.toString() !== productId
      );

      cart.totalAmount = cart.items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0
      );

      await cart.save();
      res.json({ success: true, cart });

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };

  exports.clearCart = async (req, res) => {
    try {
      const cart = await Cart.findOne({ userId: req.user._id });

      if (!cart) return res.status(404).json({ message: "Cart not found" });

      cart.items = [];
      cart.totalAmount = 0;

      await cart.save();
      res.json({ success: true });

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };


// PREVIEW TOTAL (no order creation)
exports.previewTotals = async (req, res) => {
  try {
    const { shippingAddressId, paymentMethod } = req.body;

    const address = await Address.findOne({
      _id: shippingAddressId,
      userId: req.user._id,
    });

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Invalid shipping address. Please select a valid address.",
      });
    }

    const cart = await Cart.findOne({ userId: req.user._id })
      .populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // total items amount
    const itemsTotal = cart.totalAmount;

    const isCOD = paymentMethod === "cod";

    // Every option the address can actually have, so the customer can choose
    // between waiting and paying more. Same-day only appears where a hyperlocal
    // rider will genuinely take it.
    const deliveryOptions = await getDeliveryOptions(cart.items, address, isCOD);

    // Price the chosen one through the same helper checkout uses, so the quoted
    // total and the charged total cannot diverge.
    const priced = await priceDeliveryOption(
      cart.items,
      address,
      isCOD,
      req.body.deliveryOption
    );

    const grandTotal = itemsTotal + priced.shippingCharges;

    return res.json({
      success: true,
      itemsTotal,
      shippingCharges: priced.shippingCharges,
      grandTotal,
      shippingCourier: priced.shippingCourier,
      deliveryOption: priced.deliveryOption,
      deliveryOptions,
    });
  } catch (err) {
    console.error("PREVIEW TOTAL ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to calculate totals",
    });
  }
};
