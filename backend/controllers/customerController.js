const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Inventory = require('../models/Inventory');
const Address = require('../models/Address');

// ==================== PRODUCTS ====================

// Get all products (with filters)
exports.getProducts = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, page = 1, limit = 20 } = req.query;

    // Build filter
    const filter = { isActive: true, stock: { $gt: 0 } };

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$text = { $search: search };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Get products
    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('sellerId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single product details
exports.getProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId)
      .populate('category', 'name description')
      .populate('sellerId', 'name email');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== CART ====================

// Get user's cart
exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user._id })
      .populate('items.productId', 'name price images stock');

    if (!cart) {
      cart = await Cart.create({ userId: req.user._id, items: [] });
    }

    res.json({ cart });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add item to cart
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    // Validate product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!product.isActive) {
      return res.status(400).json({ message: 'Product is not available' });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    // Find or create cart
    let cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      cart = new Cart({ userId: req.user._id, items: [] });
    }

    // Check if product already in cart
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;

      if (cart.items[existingItemIndex].quantity > product.stock) {
        return res.status(400).json({
          message: `Only ${product.stock} items available`
        });
      }
    } else {
      cart.items.push({
        productId,
        quantity,
        price: product.price
      });
    }

    cart.calculateTotal();
    await cart.save();
    await cart.populate('items.productId', 'name price images stock');

    res.status(201).json({
      message: 'Item added to cart',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update cart item quantity
exports.updateCartItem = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Item not in cart' });
    }

    const product = await Product.findById(productId);
    if (quantity > product.stock) {
      return res.status(400).json({
        message: `Only ${product.stock} items available`
      });
    }

    cart.items[itemIndex].quantity = quantity;
    cart.calculateTotal();
    await cart.save();
    await cart.populate('items.productId', 'name price images stock');

    res.json({
      message: 'Cart updated',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId
    );

    cart.calculateTotal();
    await cart.save();
    await cart.populate('items.productId', 'name price images stock');

    res.json({
      message: 'Item removed from cart',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Clear cart
exports.clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();

    res.json({
      message: 'Cart cleared',
      cart
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== CHECKOUT & ORDERS ====================

// Checkout / create order (using shippingAddressId)
// Abhi ke liye COD -> paymentStatus = 'completed'
exports.checkout = async (req, res) => {
  try {
    const { shippingAddressId } = req.body;

    const cart = await Cart.findOne({ userId: req.user._id }).populate(
      'items.productId'
    );

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    let totalAmount = 0;
    const orderItems = [];

    for (const item of cart.items) {
      const product = item.productId;

      if (product.stock < item.quantity) {
        return res
          .status(400)
          .json({ message: `Insufficient stock for ${product.name}` });
      }

      totalAmount += item.price * item.quantity;

      orderItems.push({
        productId: product._id,
        sellerId: product.sellerId,
        name: product.name,
        quantity: item.quantity,
        price: item.price,
      });
    }

    const order = await Order.create({
      customerId: req.user._id,
      items: orderItems,
      totalAmount,
      shippingAddressId,
      status: 'pending',
      paymentStatus: 'pending',
    });

    // ✅ STOCK DECREASE + INVENTORY LOG
    for (const item of cart.items) {
      const product = await Product.findById(item.productId._id);

      const stockBefore = product.stock;

      product.stock -= item.quantity;
      await product.save();

      await Inventory.create({
        productId: product._id,
        type: 'sale',
        quantity: -item.quantity, // ✅ tumhare model ke hisaab se correct
        orderId: order._id,
        performedBy: req.user._id,
        stockBefore,
        stockAfter: product.stock,
      });
    }

    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();

    res.status(201).json({
      message: 'Order placed & stock updated',
      order,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
  

// Get user's orders
exports.getMyOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { customerId: req.user._id };
    if (status) filter.status = status;

    const orders = await Order.find(filter)
      .populate('items.productId', 'name images')
      .populate('shippingAddressId')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(filter);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single order details
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      customerId: req.user._id
    })
      .populate('items.productId', 'name images')
      .populate('shippingAddressId');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel order (pending/processing only) + inventory restore
exports.cancelOrder = async (req, res) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      customerId: req.user._id,
    }).session(session);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!['pending', 'processing'].includes(order.status)) {
      return res
        .status(400)
        .json({ message: 'Order cannot be cancelled now' });
    }

    order.status = 'cancelled';
    await order.save({ session });

    // ✅ RESTORE INVENTORY
    for (const item of order.items) {
      const product = await Product.findById(item.productId).session(session);

      const stockBefore = product.stock;

      product.stock += item.quantity;
      await product.save({ session });

      await Inventory.create(
        [
          {
            productId: product._id,
            type: 'return',
            quantity: item.quantity,
            orderId: order._id,
            reason: 'Customer cancelled order',
            performedBy: req.user._id,
            stockBefore,
            stockAfter: product.stock,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: 'Order cancelled & inventory restored',
      order,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};


// Return order (delivered only) + inventory restore
exports.returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      customerId: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        message: 'Only delivered orders can be returned'
      });
    }

    // Update status
    order.status = 'returned';
    await order.save();

    // Restore stock + inventory log
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      const stockBefore = product.stock;

      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity }
      });

      const stockAfter = stockBefore + item.quantity;

      await Inventory.create({
        productId: item.productId,
        type: 'return',
        quantity: item.quantity,
        orderId: order._id,
        reason: 'Order returned by customer',
        performedBy: req.user._id,
        stockBefore,
        stockAfter
      });
    }

    res.json({
      message: 'Order returned successfully',
      order
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
