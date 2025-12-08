const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { applyInventoryChange } = require("./inventoryController");


// ✅ ADD TO CART
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


// ✅ GET CART
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


// ✅ CHECKOUT (FULLY FIXED ✅)
exports.checkout = async (req, res) => {
  try {
    const { shippingAddressId } = req.body;

    const cart = await Cart.findOne({ userId: req.user._id })
      .populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const order = await Order.create({
      customerId: req.user._id,
      items: cart.items.map((item) => ({
        productId: item.productId._id,
        name: item.productId.name,
        quantity: item.quantity,
        price: item.price,
        sellerId: item.productId.sellerId, // ✅ REQUIRED
      })),
      totalAmount: cart.totalAmount,
      shippingAddressId,
      status: "pending",
      paymentStatus: "cod", // ✅ VALID ENUM
    });

    // ✅ INVENTORY DEDUCT (ONLY VALID TYPE)
    for (const item of cart.items) {
      await applyInventoryChange({
        productId: item.productId._id,
        quantity: item.quantity,
        type: "sale", // ✅ ONLY VALID VALUE
        orderId: order._id,
        performedBy: req.user._id,
      });
    }

    // ✅ CLEAR CART
    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();

    res.status(201).json({ success: true, order });

  } catch (err) {
    console.error("CHECKOUT ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};


// ✅ GET MY ORDERS
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      customerId: req.user._id,
    }).sort({ createdAt: -1 });

    res.json({ success: true, orders });

  } catch (err) {
    console.error("GET MY ORDERS ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};


// ✅ GET ORDER DETAILS
exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customerId: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ success: true, order });

  } catch (err) {
    console.error("GET ORDER DETAILS ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};


// ✅ CANCEL ORDER (FIXED INVENTORY TYPE ✅)
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
    await order.save();

    for (const item of order.items) {
      await applyInventoryChange({
        productId: item.productId,
        quantity: item.quantity,
        type: "return", // ✅ FIXED
        orderId: order._id,
        performedBy: req.user._id,
      });
    }

    res.json({ success: true, message: "Order cancelled", order });

  } catch (err) {
    console.error("CANCEL ORDER ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};


// ✅ RETURN ORDER (FIXED INVENTORY TYPE ✅)
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

    order.status = "returned";
    await order.save();

    for (const item of order.items) {
      await applyInventoryChange({
        productId: item.productId,
        quantity: item.quantity,
        type: "return", // ✅ FIXED
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


// ✅ UPDATE CART ITEM
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


// ✅ REMOVE SINGLE ITEM
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


// ✅ CLEAR FULL CART
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
