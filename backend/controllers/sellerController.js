// backend/controllers/sellerController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const Seller = require('../models/Seller');
const { uploadImage, deleteImage } = require('../utils/cloudinary');
const { applyInventoryChange } = require('./inventoryController');

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

    const stockBefore = product.stock;
    const stockChanged = stock !== undefined && stock !== stockBefore;

    // ✅ Apply non-stock field changes
    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (price !== undefined) product.price = price;
    if (isActive !== undefined) product.isActive = isActive;
    if (lowStockThreshold !== undefined) {
      product.lowStockThreshold = lowStockThreshold;
    }

    // ✅ Save non-stock changes FIRST (before inventory change)
    // This ensures all field updates are persisted even if stock changes
    const hasNonStockChanges = name || description || category !== undefined || 
                               price !== undefined || isActive !== undefined || 
                               lowStockThreshold !== undefined;
    
    if (hasNonStockChanges) {
      await product.save();
    }

    // ✅ Apply inventory change AFTER saving non-stock changes
    // This way, if inventory change fails, non-stock changes are already saved
    if (stockChanged) {
      await applyInventoryChange({
        productId: product._id,
        quantity: stock, // For adjustment, quantity is the target stock value
        type: 'adjustment',
        performedBy: req.user._id,
        reason: 'Manual stock adjustment via product update',
      });
    }

    // ✅ Reload product to get latest state (including updated stock if changed)
    const updatedProduct = await Product.findById(product._id)
      .populate('category', 'name');
    
    // Use updated product for response
    Object.assign(product, updatedProduct.toObject());

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

    const product = await Product.findOne({
      _id: productId,
      sellerId: req.user._id,
    });

    if (!product) {
      return res.status(404).json({
        message: 'Product not found or you do not have permission',
      });
    }

    // ✅ Use applyInventoryChange for stock updates
    await applyInventoryChange({
      productId: product._id,
      quantity: stock, // For adjustment, quantity is the target stock value
      type: 'adjustment',
      performedBy: req.user._id,
      reason: 'Manual stock update by seller',
    });

    // Reload product from database to get updated stock
    const updatedProduct = await Product.findById(product._id)
      .populate('category', 'name');

    res.json({
      message: 'Stock updated successfully',
      product: updatedProduct,
      lowStockAlert: updatedProduct.stock <= updatedProduct.lowStockThreshold,
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
