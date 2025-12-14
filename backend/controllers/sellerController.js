// backend/controllers/sellerController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const Seller = require('../models/Seller');
const { uploadImage, deleteImage } = require('../utils/cloudinary');

/**
 * SELLER PRODUCTS
 */

// Get seller's products
exports.getMyProducts = async (req, res) => {
  try {
    const products = await Product.find({
      sellerId: req.user._id,
      isActive: true,
    })
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    res.json({
      count: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add new product (with multiple images)
exports.addProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      price,
      stock,
      lowStockThreshold,
      images, // base64 array
      brand,
      sku,
      mrp,
      tags,
    } = req.body;

    let imageUrls = [];

    if (images && images.length > 0) {
      for (const img of images) {
        const uploaded = await uploadImage(img);
        imageUrls.push(uploaded.url);
      }
    }

    const product = await Product.create({
      name,
      description,
      category,
      price,
      stock,
      lowStockThreshold: lowStockThreshold || 10,
      sellerId: req.user._id,
      isActive: true,
      images: imageUrls,
      brand,
      sku,
      mrp,
      tags,
    });

    res.status(201).json({ message: 'Product created', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      name,
      description,
      category,
      price,
      stock,
      isActive,
      lowStockThreshold,
      brand,
      sku,
      mrp,
      tags,
    } = req.body;

    const product = await Product.findOne({
      _id: productId,
      sellerId: req.user._id,
    });

    if (!product) {
      return res.status(404).json({
        message: 'Product not found or you do not have permission',
      });
    }

    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;
    if (isActive !== undefined) product.isActive = isActive;
    if (lowStockThreshold !== undefined) {
      product.lowStockThreshold = lowStockThreshold;
    }
    if (brand !== undefined) product.brand = brand;
    if (sku !== undefined) product.sku = sku;
    if (mrp !== undefined) product.mrp = mrp;
    if (Array.isArray(tags)) product.tags = tags;

      if (Array.isArray(req.body.images) && req.body.images.length > 0) {
      const incomingImages = req.body.images;
      const finalImages = [];

      for (const img of incomingImages) {
        if (typeof img === 'string' && img.startsWith('data:image/')) {
          // New local image (base64) → upload to Cloudinary
          const uploaded = await uploadImage(img);
          finalImages.push(uploaded.url);
        } else if (typeof img === 'string' && img.trim() !== '') {
          // Existing image URL → keep as is
          finalImages.push(img);
        }
      }

      product.images = finalImages;
    }
    await product.save();
    await product.populate('category', 'name');

    res.json({
      message: 'Product updated successfully',
      product,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Soft delete product
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      sellerId: req.user._id,
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.isActive = false;
    await product.save();

    res.json({ message: 'Product soft deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update stock manually
exports.updateStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { stock } = req.body;

    if (stock < 0) {
      return res.status(400).json({ message: 'Stock cannot be negative' });
    }

    const product = await Product.findOneAndUpdate(
      { _id: productId, sellerId: req.user._id },
      { stock },
      { new: true }
    ).populate('category', 'name');

    if (!product) {
      return res.status(404).json({
        message: 'Product not found or you do not have permission',
      });
    }

    res.json({
      message: 'Stock updated successfully',
      product,
      lowStockAlert: product.stock <= product.lowStockThreshold,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get low stock products
exports.getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({
      sellerId: req.user._id,
    }).populate('category', 'name');

    const lowStockProducts = products.filter(
      (product) => product.stock <= product.lowStockThreshold
    );

    res.json({
      count: lowStockProducts.length,
      products: lowStockProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * SELLER ORDERS – STEP-5A CORE
 */

// Get orders that contain this seller's products
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      'items.sellerId': req.user._id,
    })
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 });

    const sellerOrders = orders.map((order) => {
      const sellerItems = order.items.filter(
        (item) => item.sellerId.toString() === req.user._id.toString()
      );

      return {
        _id: order._id,
        customerId: order.customerId,
        items: sellerItems,
        status: order.status,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      };
    });

    res.json({
      count: sellerOrders.length,
      orders: sellerOrders,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update order status from seller side
// Allowed forward-only transitions:
// pending -> processing -> shipped -> delivered
// delivered/cancelled/returned cannot be changed
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['processing', 'shipped', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message:
          'Invalid status. Valid values: processing, shipped, delivered',
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check order already cancelled/returned
    if (['cancelled', 'returned'].includes(order.status)) {
      return res.status(400).json({
        message: `Order is already ${order.status} and cannot be updated`,
      });
    }

    // Ensure this seller is part of this order
    const hasSellerItems = order.items.some(
      (item) => item.sellerId.toString() === req.user._id.toString()
    );

    if (!hasSellerItems) {
      return res.status(403).json({
        message: 'You do not have permission to update this order',
      });
    }

    // Enforce forward-only transitions
    const allowedNext = {
      pending: ['processing'],
      processing: ['shipped'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: [],
      returned: [],
    };

    const currentStatus = order.status;
    const allowedForCurrent = allowedNext[currentStatus] || [];

    if (!allowedForCurrent.includes(status)) {
      return res.status(400).json({
        message: `Invalid status transition: ${currentStatus} -> ${status}`,
      });
    }

    // Apply new status
    order.status = status;

    // When delivered, mark payment as completed
    if (status === 'delivered') {
      order.paymentStatus = 'completed';
    }

    await order.save();

    res.json({
      message: 'Order status updated successfully',
      order,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * SELLER ANALYTICS & PROFILE
 */

// Get seller analytics (products + revenue)
exports.getSellerAnalytics = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({
      sellerId: req.user._id,
    });

    const activeProducts = await Product.countDocuments({
      sellerId: req.user._id,
      isActive: true,
    });

    const allProducts = await Product.find({ sellerId: req.user._id });
    const lowStockCount = allProducts.filter(
      (p) => p.stock <= p.lowStockThreshold
    ).length;

    // Revenue from completed orders
    const revenue = await Order.aggregate([
      { $unwind: '$items' },
      {
        $match: {
          'items.sellerId': req.user._id,
          paymentStatus: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: { $multiply: ['$items.price', '$items.quantity'] },
          },
        },
      },
    ]);

    res.json({
      products: {
        total: totalProducts,
        active: activeProducts,
        lowStock: lowStockCount,
      },
      revenue: revenue[0]?.total || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get seller profile
exports.getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user.id });

    if (!seller) {
      return res.status(404).json({ message: 'Seller profile not found' });
    }

    res.json(seller);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: 'Server error', error: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      sellerId: req.user._id,
    }).populate('category', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ success: true, product });
  } catch (err) {
    console.error('GET PRODUCT BY ID ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// Update tracking info for an order (seller side)
// Update tracking info for an order (seller side)
exports.updateTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { courierName, trackingNumber } = req.body;

    if (!courierName || !trackingNumber) {
      return res
        .status(400)
        .json({ message: 'Courier and tracking number are required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ensure this seller belongs to this order
    const hasSellerItems = order.items.some(
      (item) => item.sellerId.toString() === req.user.id.toString()
    );
    if (!hasSellerItems) {
      return res
        .status(403)
        .json({ message: 'You do not have permission to update this order' });
    }

    order.trackingInfo = {
      courierName,
      trackingNumber,
      shippedDate: new Date(),
    };

    // Optionally auto-mark as shipped if still pending/processing
    if (['pending', 'processing'].includes(order.status)) {
      order.status = 'shipped';
    }

    await order.save();

const User = require('../models/User');
const { shippingNotificationEmail } = require('../utils/emailTemplates');
const sendEmail = require('../utils/sendEmail');

try {
  const customer = await User.findById(order.customerId);
  const template = shippingNotificationEmail(order, customer, order.trackingInfo);
  await sendEmail({ to: customer.email, ...template });
  console.log('📧 Shipping email sent to customer');
} catch (emailErr) {
  console.log('Email error:', emailErr.message);
}

return res.json({
  success: true,
  message: 'Tracking updated',
  order,
});
  } catch (err) {
    console.error('TRACKING UPDATE ERROR', err.message);
    return res.status(500).json({ message: err.message });
  }
};
