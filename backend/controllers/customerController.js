const Cart = require("../models/Cart");
const Order = require("../models/Order");
const { priceOrder, markCouponUsed } = require("../utils/priceOrder");
const { effectivePrice } = require("../utils/discount");
const {
  calculateShipping,
  getDeliveryOptions,
  priceDeliveryOption,
} = require("../utils/shipping");
const { releaseReservation } = require("../utils/reservation");
// The same constant payout settles against, so the promise made to the customer
// and the moment a seller's money is released can never drift apart.
const { RETURN_WINDOW_DAYS, returnWindowFor } = require("../utils/payout");
const Product = require("../models/Product");
const mongoose = require('mongoose'); 
const Address = require('../models/Address'); 
const { applyInventoryChange } = require("./inventoryController");
const { cancelOrderFor, canCancelOrder } = require('../utils/cancelOrder');
const refunds = require('../utils/refund');
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
          // The price in force right now, which is the sale price if one is
          // running. See utils/discount.js.
          price: effectivePrice(product).price,
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

      /*
       * Re-price the basket every time it is read.
       *
       * A line's price is stamped when the item is added, so a sale that starts
       * or ends while something sits in a basket would otherwise leave the cart
       * showing yesterday's number - and the checkout charging today's. That
       * gap between the displayed price and the charged one is exactly the
       * drip-pricing complaint the CCPA fined FirstCry Rs 2 lakh over.
       *
       * A sale ENDING moves the price up, which is why this is done on read
       * rather than quietly at checkout: the customer sees the change before
       * they pay, not on the receipt.
       */
      let repriced = false;
      cart.items.forEach((item) => {
        if (!item.productId) return;
        const now = effectivePrice(item.productId).price;
        if (now && now !== item.price) {
          item.price = now;
          repriced = true;
        }
      });

      if (repriced) {
        cart.totalAmount = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        await cart.save();
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


    /*
     * One place decides what this order costs and who ends up with what -
     * commission AND any discount, snapshotted onto every line. See
     * utils/priceOrder.js for why that is not done here.
     */
    const { orderItems, itemsTotal, discountTotal, coupon, couponError } =
      await priceOrder({
        items: cart.items,
        couponCode: req.body.couponCode,
        customerId: req.user._id,
        session,
      });

    /*
     * A refused code stops the checkout rather than quietly charging full
     * price. Someone who typed a code is expecting it to come off; taking their
     * money without it and letting them find out on the receipt is the same
     * silence this codebase keeps removing from everywhere else.
     */
    if (couponError) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: couponError });
    }

    const order = await Order.create(
      [
        {
          customerId: req.user._id,
          items: orderItems,
          // Goods, less any discount, plus delivery. Delivery is never
          // discounted - it is money owed to a courier, not margin.
          totalAmount: Math.max(0, itemsTotal - discountTotal) + shippingCharges,
          couponCode: coupon?.code || null,
          discountAmount: discountTotal,
          discountFundedBy: coupon?.fundedBy || null,
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

    /*
     * Spend the coupon use HERE, not at delivery.
     *
     * A COD order is a real commitment - the goods get packed and a courier is
     * booked. Waiting for the cash days later would let one customer place five
     * COD orders on a one-per-person code before the first of them arrives.
     * A cancelled order gives the use back (see utils/cancelOrder.js), which is
     * the half that makes counting early fair.
     */
    if (coupon?.code) {
      await markCouponUsed(coupon.code, req.user._id, session);
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
        const { subject, html, text } = orderConfirmedEmail(order[0], customer);

        await sendSafeEmail({
          toUserId: customer._id,
          toEmail: customer.email,
          subject,
          html,
          text,
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
      .populate("shippingAddressId")
      .populate({ path: "items.productId", select: "name slug images" });

    res.json({
      success: true,
      // canCancel travels with each order for the same reason the details page
      // gets it: the list was drawing a Cancel button on shipped parcels the
      // API would refuse. See canCancelOrder.
      orders: orders.map((order) => ({
        ...order.toObject(),
        canCancel: canCancelOrder(order),
      })),
    });
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
    })
      .populate("shippingAddressId")
      /*
       * The picture and the link back to the product.
       *
       * An order line stores only a name and a price - correct, because a
       * snapshot must not change when the seller edits the listing. But a list
       * of names is not how anybody recognises what they bought, and there was
       * no way back to the product to buy it again or read its returns terms.
       *
       * Only these three fields: the snapshot still decides what was paid.
       * `images` can be missing on an older product, and the page must render
       * without it.
       */
      .populate({ path: "items.productId", select: "name slug images" });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // The order page needs to know whether to offer a Return at all. Sending
    // this rather than letting the client re-derive it keeps one answer: the
    // button and the endpoint that serves it can no longer disagree.
    const { canReturn, returnWindowClosesAt, returnWindowDays } = returnWindowFor(order);

    /*
     * Whether cancelling is still possible, decided HERE rather than by the
     * page re-deriving it.
     *
     * The order page was offering "Cancel Item" on a shipped parcel: the server
     * refuses it (CANCELLABLE is pending/processing only), so the button did
     * nothing but promise something impossible. Same reasoning as canReturn -
     * one answer, so the button and the endpoint cannot disagree.
     */
    const canCancel = canCancelOrder(order);

    res.json({
      success: true,
      order,
      canReturn,
      returnWindowClosesAt,
      returnWindowDays,
      canCancel,
    });
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
      return res.status(404).json({ message: 'Order not found' });
    }

    // The rules live in utils/cancelOrder.js so a customer, a seller and an
    // admin all cancel the same way - three copies would refund three
    // different amounts.
    const result = await cancelOrderFor(order, {
      by: 'customer',
      actorId: req.user.id,
      reason: req.body?.reason,
    });

    if (!result.ok) {
      return res
        .status(result.status || 400)
        .json({ success: false, message: result.message });
    }

    return res.json({ success: true, message: result.message, order });
  } catch (err) {
    console.error('CANCEL ORDER ERROR:', err.message);
    return res.status(500).json({ message: err.message });
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
      try {
        // Every refund in the app goes through this one boundary - see
        // utils/refund.js. It takes RUPEES; the paise conversion lives there.
        const refund = await refunds.refundPayment(
          order.razorpayPaymentId,
          refundAmount
        );
        
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


  /**
   * A customer asking to send something back.
   *
   * WHAT THIS USED TO DO, AND WHY IT WAS WRONG
   *   Pressing Return refunded the money immediately and counted the goods back
   *   in as sellable stock - before anything had been collected, and without
   *   anybody ever seeing the item again. A customer could keep a RS 2,300
   *   necklace and the RS 2,300, and the shop would carry the whole loss while
   *   its own stock figure said the necklace was on the shelf.
   *
   *   Flipkart's policy is explicit about this: "the refund will be processed
   *   once the returned product has been received by the seller." A return
   *   request is a claim. It becomes a fact when the goods come back.
   *
   *   So this now records the request and nothing else. No money moves, no
   *   stock moves, and the parcel is NOT marked returned - it is still with the
   *   customer, which is the truth. What it does do is hold the seller's payout
   *   (see deliveryTruth.payoutBlockedReason), because money that has left
   *   cannot be brought back.
   */
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
      const { canReturn, returnWindowClosesAt } = returnWindowFor(order);
      if (!canReturn) {
        return res.status(400).json({
          message: `The ${RETURN_WINDOW_DAYS}-day return window for this order closed on ${returnWindowClosesAt.toDateString()}.`,
          returnWindowDays: RETURN_WINDOW_DAYS,
          windowClosedAt: returnWindowClosesAt,
        });
      }

      const already = order.fulfilments.find((f) =>
        ['requested', 'picked'].includes(f.returnStage)
      );
      if (already) {
        return res.status(409).json({
          message: 'A return for this order is already in progress.',
        });
      }

      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 3) {
        return res.status(400).json({
          message:
            'Please say what is wrong with it. The seller is told, and it decides whether the return is accepted.',
        });
      }

      /*
       * Money back, or the same item again.
       *
       * WHY THE CUSTOMER CHOOSES, AND CHOOSES NOW
       *   The two settle completely differently and neither can be undone
       *   without a second return. Left to whoever settles it, a seller could
       *   refund somebody who wanted the necklace, or post a replacement to
       *   somebody who wanted their money - and both are the sort of thing that
       *   only surfaces as a complaint.
       *
       *   Defaults to a refund. That is what this endpoint has always done, so
       *   an older app that sends nothing keeps getting exactly what its
       *   customers were promised rather than silently switching them to an
       *   exchange.
       */
      const resolution = String(req.body?.resolution || 'refund').trim();
      if (!['refund', 'replacement'].includes(resolution)) {
        return res.status(400).json({
          message: "Choose either a refund or a replacement.",
        });
      }

      /*
       * Which parcels can still be sent back.
       *
       * Only ones that actually arrived - the status stays 'delivered' either
       * way, because the goods are still with the customer until a courier
       * takes them.
       *
       * A parcel whose EXCHANGE has completed is eligible again. The customer
       * is holding a replacement that arrived on its own delivery date, with
       * its own seven days, and if that one is faulty too they are not out of
       * options. Without this the request saved nothing at all and still
       * answered "return requested" - a silent no.
       */
      const eligible = order.fulfilments.filter(
        (f) =>
          f.status === 'delivered' &&
          (!f.returnStage || f.replacementStage === 'delivered')
      );

      if (!eligible.length) {
        return res.status(400).json({
          message: 'There is nothing on this order that can be sent back.',
        });
      }

      /*
       * One exchange per parcel, and then it has to be money.
       *
       * A replacement that can itself be replaced is a loop with no end: goods
       * leave the shop on every turn, nothing is ever refunded, and no rule
       * stops it. Amazon caps replacements for the same reason. If the second
       * one is faulty as well, something is wrong with the product rather than
       * with that particular piece, and the honest answer is the customer's
       * money back.
       */
      if (
        resolution === 'replacement' &&
        eligible.some((f) => f.replacementStage === 'delivered')
      ) {
        return res.status(400).json({
          message:
            'This one has already been replaced once. Ask for a refund instead and we will put the money back.',
        });
      }

      const requestedAt = new Date();
      eligible.forEach((f) => {
        f.returnStage = 'requested';
        f.returnRequestedAt = requestedAt;
        f.returnReason = reason;
        f.returnResolution = resolution;

        /*
         * A finished exchange is cleared so the payout hold reads the NEW
         * return rather than the old replacement, which is delivered and
         * settled. What that parcel was and why it was swapped is already kept
         * in fulfilment.previousParcels.
         */
        f.replacementStage = null;
        f.replacementDueAt = null;
        f.replacementBookedAt = null;
        f.replacementDeliveredAt = null;
        f.returnNote = null;
      });

      await order.save();

      res.json({
        success: true,
        message:
          resolution === 'replacement'
            ? 'Replacement requested. Once the item is back with the seller, a new one is sent out.'
            : 'Return requested. Once the item is back with the seller your refund is processed.',
        order,
      });
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

const truth = require('../utils/deliveryTruth');

/**
 * The customer's answer to a delivery only the seller claimed.
 *
 * When no courier was booked - a parcel handed over by hand in the same city -
 * there is no third party to ask, so the seller's word is taken. It is recorded
 * AS the seller's word, and the customer gets the one thing that makes that
 * fair: the chance to say yes or no before the money moves.
 *
 * Confirming here is not a formality. It is what ends the hold on the seller's
 * payout, so a customer who confirms is releasing somebody's money - which is
 * why silence releases it too, after SELF_DELIVERY_CONFIRM_DAYS. A claim nobody
 * ever answers cannot hold a shop's earnings forever.
 */
exports.confirmReceipt = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customerId: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const waiting = order.fulfilments.filter(
      (f) => f.status === 'delivered' && f.deliveryConfirmedBy === 'seller'
    );
    if (!waiting.length) {
      return res.status(400).json({
        message: 'There is nothing waiting for you to confirm on this order.',
      });
    }

    waiting.forEach((f) => {
      f.deliveryConfirmedBy = 'customer';
    });

    await order.save();

    res.json({
      success: true,
      message: 'Thank you - that is confirmed.',
    });
  } catch (err) {
    console.error('CONFIRM RECEIPT ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
};

/**
 * "This is wrong" - the customer's only lever, and the one that must exist.
 *
 * Raising this does not decide anything and does not move money. What it does
 * is stop the seller's payout and put the disagreement in front of an admin,
 * which is the whole point: once a seller has been paid, getting it back means
 * taking it off a future payout they may never earn.
 *
 * This is deliberately open to a customer whose parcel says 'delivered' by
 * courier scan too. Couriers do mark parcels delivered that never arrived, and
 * a system where the courier's word is final in every case has quietly decided
 * that the customer is always the liar.
 */
exports.raiseDispute = async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 10) {
      return res.status(400).json({
        message:
          'Please describe what happened in a sentence or two. An admin reads this, and the seller is asked to respond to it.',
      });
    }

    const order = await Order.findOne({
      _id: req.params.orderId,
      customerId: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Nothing to argue about before a parcel has moved.
    const arguable = order.fulfilments.filter((f) =>
      ['shipped', 'delivered'].includes(f.status)
    );
    if (!arguable.length) {
      return res.status(400).json({
        message: 'This order has not been sent yet, so there is nothing to dispute. Cancel it instead.',
      });
    }
    if (arguable.some((f) => f.disputeStatus === 'open')) {
      return res.status(409).json({
        message: 'A dispute on this order is already open. We will come back to you on it.',
      });
    }

    const now = new Date();
    arguable.forEach((f) => {
      f.disputeStatus = 'open';
      f.disputeReason = reason;
      f.disputeRaisedAt = now;
    });

    await order.save();

    console.warn(`Dispute raised on ${order.orderNumber} by customer ${req.user._id}`);

    res.json({
      success: true,
      message:
        'Thank you - we have this. The seller has been asked to respond and nothing is paid out until it is settled.',
    });
  } catch (err) {
    console.error('RAISE DISPUTE ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
};

const Coupon = require('../models/Coupon');
const { evaluateCoupon } = require('../utils/applyCoupon');

/**
 * Checking a code before the customer commits to anything.
 *
 * WHY THIS EXISTS SEPARATELY FROM CHECKOUT
 *   A customer types a code and wants to know, now, whether it works and what
 *   it is worth. Making them press Pay to find out is the kind of interface
 *   that teaches people not to bother with codes at all.
 *
 * It never spends a use - see utils/applyCoupon.js. Only a paid order does.
 * The checkout re-evaluates from scratch, so a code that expires between this
 * call and payment is still caught; this is a preview, not a promise.
 */
exports.previewCoupon = async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ success: false, message: 'Enter a code' });
    }

    const cart = await Cart.findOne({ userId: req.user._id }).populate('items.productId');
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Your basket is empty' });
    }

    const lines = cart.items.map((item) => ({
      sellerId: item.productId.sellerId,
      price: item.price,
      quantity: item.quantity,
    }));

    const coupon = await Coupon.findOne({ code });
    const verdict = evaluateCoupon(coupon, { lines, customerId: req.user._id });

    if (!verdict.ok) {
      // 200, not 4xx: the request was fine, the code was not. The page shows
      // the reason rather than a generic failure.
      return res.json({ success: false, message: verdict.reason });
    }

    return res.json({
      success: true,
      code: verdict.code,
      discount: verdict.discount,
      description: verdict.description,
      message: `₹${verdict.discount} off applied`,
    });
  } catch (err) {
    console.error('PREVIEW COUPON ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
