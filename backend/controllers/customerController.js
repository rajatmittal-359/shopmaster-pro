const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Product = require("../models/Product");
const mongoose = require('mongoose'); 
const Address = require('../models/Address'); 
const { applyInventoryChange } = require("./inventoryController");
const InventoryLog = require("../models/Inventory");

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

    //  Validate address exists & belongs to user
    const address = await Address.findOne({
      _id: shippingAddressId,
      userId: req.user._id,
    }).session(session);

    if (!address) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "Invalid shipping address. Please select a valid address." 
      });
    }

    const cart = await Cart.findOne({ userId: req.user._id })
      .populate("items.productId")
      .session(session);

    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Atomic stock validation
    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id).session(session);
      
      if (!product || !product.isActive) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: `Product ${item.productId.name} is no longer available` 
        });
      }

      if (product.stock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${product.stock}` 
        });
      }
    }

    //  Create order
    const order = await Order.create([{
      customerId: req.user._id,
      items: cart.items.map((item) => ({
        productId: item.productId._id,
        name: item.productId.name,
        quantity: item.quantity,
        price: item.price,
        sellerId: item.productId.sellerId,
      })),
      totalAmount: cart.totalAmount,
      shippingAddressId,
      status: "pending",
      paymentStatus: "cod",
    }], { session });

    //  Update stock atomically
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(
        item.productId._id,
        { $inc: { stock: -item.quantity } },
        { session }
      );

      // Log inventory
      await InventoryLog.create([{
        productId: item.productId._id,
        type: "sale",
        quantity: -item.quantity,
        stockBefore: item.productId.stock,
        stockAfter: item.productId.stock - item.quantity,
        orderId: order[0]._id,
        performedBy: req.user._id,
      }], { session });
    }

    //  Clear cart
    cart.items = [];
    cart.totalAmount = 0;
    await cart.save({ session });

 await session.commitTransaction();

    // COD order confirmation email (safe)
    try {
      const customer = req.user; // login user

      const { subject, html } = orderConfirmedEmail(order[0], customer);

      await sendSafeEmail({
        toUserId: customer._id,
        toEmail: customer.email, // optional
        subject,
        html,
      });
    } catch (emailErr) {
      console.error('COD order email failed:', emailErr.message);
    }

    res.status(201).json({
      success: true,
      order: order[0],
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("CHECKOUT ERROR:", err.message);
    res.status(500).json({ 
      message: err.message || "Checkout failed. Please try again." 
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
      customerId: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!["pending", "processing"].includes(order.status)) {
      return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    order.status = "cancelled";
    if (order.paymentStatus === 'completed') {
  const Razorpay = require('razorpay');
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  
  try {
    if (order.razorpayOrderId) {
      const refund = await razorpay.payments.refund(order.razorpayOrderId, {
        amount: Math.round(order.totalAmount * 100),
        speed: 'normal',
      });
      order.refundId = refund.id;
      order.refundStatus = 'processing';
      console.log('✅ Refund initiated:', refund.id);
    }
  } catch (refundErr) {
    console.error('Refund failed:', refundErr.message);
    // Continue with cancellation anyway
  }
}

await order.save();
    for (const item of order.items) {
      if (item.status === 'active') {
        await applyInventoryChange({
          productId: item.productId,
          quantity: item.quantity,
          type: "return",
          orderId: order._id,
          performedBy: req.user._id,
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

// Replace entire cancelOrderItem function (Line ~200)
exports.cancelOrderItem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { orderId, itemId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      customerId: req.user._id,
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

    // ✅ First restore inventory
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

    // ✅ Then update order
    item.status = 'cancelled';
    order.totalAmount -= item.price * item.quantity;
    if (order.totalAmount < 0) order.totalAmount = 0;

    const allCancelled = order.items.every((it) => it.status === 'cancelled');
    if (allCancelled) {
      order.status = 'cancelled';
    }

    await order.save({ session });
    await session.commitTransaction();

    res.json({ success: true, message: 'Order item cancelled', order });
  } catch (err) {
    await session.abortTransaction();
    console.error('CANCEL ORDER ITEM ERROR:', err.message);
    res.status(500).json({ message: err.message });
  } finally {
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
    if (order.razorpayOrderId) {
      const refund = await razorpay.payments.refund(order.razorpayOrderId, {
        amount: Math.round(order.totalAmount * 100),
        speed: 'normal',
      });
      order.refundId = refund.id;
      order.refundStatus = 'processing';
      console.log('✅ Return refund initiated:', refund.id);
    }
  } catch (refundErr) {
    console.error('Refund failed:', refundErr.message);
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
