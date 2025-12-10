const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const InventoryLog = require("../models/Inventory");
const mongoose = require("mongoose");
const Address = require("../models/Address");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.createRazorpayOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { shippingAddressId } = req.body;

    const address = await Address.findOne({
      _id: shippingAddressId,
      userId: req.user.id,
    }).session(session);

    if (!address) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: 'Invalid shipping address' });
    }

    const cart = await Cart.findOne({ userId: req.user.id })
      .populate('items.productId')
      .session(session);

    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: 'Cart is empty' });
    }

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
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`,
        });
      }
    }

    // Create razorpay order BEFORE saving to DB
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(cart.totalAmount * 100),
      currency: 'INR',
      receipt: `order_temp_${Date.now()}`,
    });

    // Now create DB order with razorpay order_id
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
          totalAmount: cart.totalAmount,
          shippingAddressId,
          status: 'pending',
          paymentStatus: 'pending',
          razorpayOrderId: razorpayOrder.id,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      dbOrderId: order[0]._id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('RAZORPAY ORDER ERROR:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create payment order',
    });
  }
};


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

    const order = await Order.findById(dbOrderId)
      .populate("items.productId")
      .session(session);

    if (!order) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    order.paymentStatus = "completed";
    await order.save({ session });

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

    await Cart.findOneAndUpdate(
      { userId: order.customerId },
      { items: [], totalAmount: 0 },
      { session }
    );

    await session.commitTransaction();

    //  Send order confirmation email
    const User = require('../models/User');
    const { orderConfirmedEmail } = require('../utils/emailTemplates');
    const sendEmail = require('../utils/sendEmail');

    const customer = await User.findById(order.customerId);
    const template = orderConfirmedEmail(order, customer);
    await sendEmail({ to: customer.email, ...template }).catch(e => console.log('Email error:', e.message));
    
   
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
