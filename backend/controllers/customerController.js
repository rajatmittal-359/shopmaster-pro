const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');

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
      // Create empty cart if doesn't exist
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
      item => item.productId.toString() === productId
    );

    if (existingItemIndex > -1) {
      // Update quantity
      cart.items[existingItemIndex].quantity += quantity;
      
      // Check stock again
      if (cart.items[existingItemIndex].quantity > product.stock) {
        return res.status(400).json({ 
          message: `Only ${product.stock} items available` 
        });
      }
    } else {
      // Add new item
      cart.items.push({
        productId,
        quantity,
        price: product.price
      });
    }

    // Calculate total
    cart.calculateTotal();
    await cart.save();

    // Populate and return
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
      item => item.productId.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Item not in cart' });
    }

    // Check stock
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
      item => item.productId.toString() !== productId
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

// Checkout (Create order from cart)
exports.checkout = async (req, res) => {
  try {
    const { shippingAddress } = req.body;

    // Validate shipping address
    if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || 
        !shippingAddress.state || !shippingAddress.zipCode) {
      return res.status(400).json({ message: 'Complete shipping address required' });
    }

    // Get cart
    const cart = await Cart.findOne({ userId: req.user._id })
      .populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    // Validate stock and prepare order items
    let totalAmount = 0;
    const orderItems = [];

    for (const item of cart.items) {
      const product = item.productId;

      // Check if product still exists and is active
      if (!product || !product.isActive) {
        return res.status(400).json({ 
          message: `Product ${product?.name || 'unknown'} is no longer available` 
        });
      }

      // Check stock
      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Only ${product.stock} available.` 
        });
      }

      // Calculate total
      totalAmount += item.price * item.quantity;

      // Prepare order item
      orderItems.push({
        productId: product._id,
        sellerId: product.sellerId,
        name: product.name,
        quantity: item.quantity,
        price: item.price
      });
    }

    // Create order
    const order = await Order.create({
      customerId: req.user._id,
      items: orderItems,
      totalAmount,
      shippingAddress,
      status: 'pending',
      paymentStatus: 'pending'
    });

    // Update product stock
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(item.productId._id, {
        $inc: { stock: -item.quantity }
      });
    }

    // Clear cart
    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();

    // Populate order
    await order.populate('items.productId', 'name images');

    res.status(201).json({
      message: 'Order placed successfully',
      order
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
    }).populate('items.productId', 'name images');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      customerId: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Can only cancel if status is pending or processing
    if (!['pending', 'processing'].includes(order.status)) {
      return res.status(400).json({ 
        message: 'Order cannot be cancelled at this stage' 
      });
    }

    order.status = 'cancelled';
    await order.save();

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity }
      });
    }

    res.json({
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
