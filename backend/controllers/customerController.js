const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Product = require("../models/Product");
const mongoose = require('mongoose'); 
const Address = require('../models/Address'); 
const { applyInventoryChange } = require("./inventoryController");
const InventoryLog = require("../models/Inventory");

const { getShippingRate, pickBestCourier } = require('../utils/shiprocketService');


const sendSafeEmail = require('../utils/sendSafeEmail');
const { orderConfirmedEmail } = require('../utils/emailTemplates');

  exports.addToCart = async (req, res) => {
    try {
      const { productId, quantity } = req.body;

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

      if (itemIndex > -1) {
        cart.items[itemIndex].quantity += quantity;
      } else {
        cart.items.push({
          productId,
          quantity,
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

      if (product.stock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
        });
      }
    }

    // ✅ Calculate shipping charges via Shiprocket
// ✅ Calculate shipping charges via Shiprocket
let shippingCharges = 0;
let shippingCourier = null;

try {
  // Total cart weight (fallback 0.5 kg per item)
  const totalWeight = cart.items.reduce((sum, item) => {
    return sum + (item.productId.weight || 0.5) * item.quantity;
  }, 0);

  const pincode = address.zipCode;
  const isCOD = req.body.paymentMethod === 'cod';

  const shippingData = await getShippingRate(pincode, totalWeight, isCOD);

  // ✅ FIXED: Correct path & field access
  const couriers =
    shippingData?.data?.available_courier_companies ||
    shippingData?.available_courier_companies ||
    [];

  if (couriers.length > 0) {
    // Cheapest courier pick
    const cheapest = couriers.reduce((min, curr) => {
      // ✅ Try multiple field names
      const currRate = curr.freight_charge || curr.rate || curr.total_charge || 0;
      const minRate = min.freight_charge || min.rate || min.total_charge || 0;
      return currRate < minRate ? curr : min;
    });

    // ✅ Get base shipping rate
    const baseRate = cheapest.freight_charge || cheapest.rate || cheapest.total_charge || 0;
    
    // ✅ Get COD charges if applicable
    const codFee = isCOD && (cheapest.cod_charges || cheapest.cod_charge || 0);

    shippingCharges = Math.round(baseRate + codFee);
    shippingCourier = cheapest.courier_name || cheapest.courier_company_id || 'Shiprocket';

    // ✅ DEBUG LOG
    console.log('📦 COD SHIPPING:', {
      totalWeight,
      pincode,
      isCOD,
      baseRate,
      codFee,
      total: shippingCharges,
      courier: shippingCourier
    });
  } else {
    // Fallback
    shippingCharges = 100;
    shippingCourier = 'Standard Shipping';
    console.warn('⚠️ Shiprocket: No couriers available - using fallback');
  }
} catch (shipErr) {
  console.error('Shipping calculation failed:', shipErr.message);
  shippingCharges = 100;
  shippingCourier = 'Standard Shipping';
}


    // ✅ Create order
    const order = await Order.create(
      [
        {
          customerId: req.user._id,
          items: cart.items.map((item) => ({
            productId: item.productId._id,
            name: item.productId.name,
            quantity: item.quantity,
            price: item.price,
            sellerId: item.productId.sellerId,
          })),
          totalAmount: cart.totalAmount + shippingCharges,
          shippingAddressId,
          status: 'pending',
          paymentStatus: 'pending',
          paymentMethod: 'cod',
          // ✅ NEW SHIPPING FIELDS
          shippingCharges,
          shippingProvider: 'shiprocket',
          shippingCourierName: shippingCourier,
        },
      ],
      { session }
    );

    // ✅ Update stock + inventory logs
    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id).session(
        session
      );

      const stockBefore = product.stock;
      const stockAfter = stockBefore - item.quantity;

      product.stock = stockAfter;
      await product.save({ session });

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
    if (order.paymentMethod === 'cod' && order.paymentStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: "COD order already delivered and payment collected. Cannot cancel. Please use Return option if needed."
      });
    }

    order.status = 'cancelled';

    // Refund logic for completed payments
    if (order.paymentStatus === 'completed') {
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      try {
        if (order.razorpayPaymentId) {
          const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
            amount: Math.round(order.totalAmount * 100),
            speed: 'normal',
          });
          order.refundId = refund.id;
          order.refundStatus = 'processing';
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

    await order.save();

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

    order.totalAmount = 0;
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
    
    // ✅ NEW: Calculate refund amount for this item
    const refundAmount = item.price * item.quantity;
    
    // First restore inventory
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
    
    // ✅ NEW: Process refund if payment completed
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
    
    const allCancelled = order.items.every(it => it.status === 'cancelled');
    if (allCancelled) order.status = 'cancelled';
    
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

      order.status = 'returned';

// Initiate refund for returned orders
if (order.paymentStatus === 'completed') {
  const Razorpay = require('razorpay');
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  
  try {
    if (order.razorpayPaymentId) {  // ✅ CORRECT - Payment ID
      const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
        amount: Math.round(order.totalAmount * 100),
        speed: 'normal',
      });
      order.refundId = refund.id;
      order.refundStatus = 'processing';
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

      const cart = await Cart.findOne({ userId: req.user._id });

      if (!cart) return res.status(404).json({ message: "Cart not found" });

      const item = cart.items.find(
        (i) => i.productId.toString() === productId
      );

      if (!item) return res.status(404).json({ message: "Item not found" });

      item.quantity = quantity;

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
  // TEMP TEST ONLY - later delete
exports.testShiprocketRate = async (req, res) => {
  try {
    const { pincode } = req.query;

    const data = await getShippingRate(pincode, 0.5, true); // 0.5 kg, COD true

    console.log('SHIPROCKET RAW RESPONSE ===>');
    console.dir(data, { depth: null });

    res.json({ ok: true, data });
  } catch (err) {
    console.error('SHIPROCKET TEST ERROR', err.message);
    res.status(500).json({ ok: false, message: err.message });
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

    // shipping calculation (same as checkout)
    let shippingCharges = 0;
    let shippingCourier = null;

    try {
      const totalWeight = cart.items.reduce((sum, item) => {
        return sum + (item.productId.weight || 0.5) * item.quantity;
      }, 0);

      const pincode = address.zipCode;
      const isCOD = paymentMethod === "cod";

      const shippingData = await getShippingRate(pincode, totalWeight, isCOD);

      const couriers =
        shippingData?.data?.available_courier_companies ||
        shippingData?.available_courier_companies ||
        [];

      if (couriers.length > 0) {
        const cheapest = couriers.reduce((min, curr) => {
          const currRate =
            curr.freight_charge || curr.rate || curr.total_charge || 0;
          const minRate =
            min.freight_charge || min.rate || min.total_charge || 0;
          return currRate < minRate ? curr : min;
        });

        const baseRate =
          cheapest.freight_charge || cheapest.rate || cheapest.total_charge || 0;
        const codFee =
          isCOD && (cheapest.cod_charges || cheapest.cod_charge || 0);

        shippingCharges = Math.round(baseRate + codFee);
        shippingCourier =
          cheapest.courier_name || cheapest.courier_company_id || "Shiprocket";
      } else {
        shippingCharges = 100;
        shippingCourier = "Standard Shipping";
      }
    } catch (err) {
      console.error("PREVIEW SHIPPING ERROR:", err.message);
      shippingCharges = 100;
      shippingCourier = "Standard Shipping";
    }

    const grandTotal = itemsTotal + shippingCharges;

    return res.json({
      success: true,
      itemsTotal,
      shippingCharges,
      grandTotal,
      shippingCourier,
    });
  } catch (err) {
    console.error("PREVIEW TOTAL ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to calculate totals",
    });
  }
};
