const Product = require('../models/Product');
const Order = require('../models/Order');
const Seller = require('../models/Seller');
const { uploadImage, deleteImage } = require('../utils/cloudinary');

// Get seller's products
exports.getMyProducts = async (req, res) => {
  try {
    const products = await Product.find({ sellerId: req.user._id })
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    res.json({
      count: products.length,
      products
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add new product
exports.addProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      price,
      stock,
      lowStockThreshold,
      image, // base64 string from frontend
    } = req.body;

    let imageUrl = null;
    if (image) {
      const imageData = await uploadImage(image);
      imageUrl = imageData.url; // ← Extract only URL
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
      images: imageUrl ? [imageUrl] : [], // ← Store only URL string
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
    const { name, description, category, price, stock, isActive, lowStockThreshold } = req.body;

    // Find product and verify ownership
    const product = await Product.findOne({ 
      _id: productId, 
      sellerId: req.user._id 
    });

    if (!product) {
      return res.status(404).json({ 
        message: 'Product not found or you do not have permission' 
      });
    }

    // Update fields
    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;
    if (isActive !== undefined) product.isActive = isActive;
    if (lowStockThreshold !== undefined) product.lowStockThreshold = lowStockThreshold;

    await product.save();
    await product.populate('category', 'name');

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findOneAndDelete({ 
      _id: productId, 
      sellerId: req.user._id 
    });

    if (!product) {
      return res.status(404).json({ 
        message: 'Product not found or you do not have permission' 
      });
    }

    res.json({
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update stock/inventory
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
        message: 'Product not found or you do not have permission' 
      });
    }

    res.json({
      message: 'Stock updated successfully',
      product,
      lowStockAlert: product.stock <= product.lowStockThreshold
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get low stock products
exports.getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({ 
      sellerId: req.user._id 
    }).populate('category', 'name');

    // Filter products with low stock
    const lowStockProducts = products.filter(product => 
      product.stock <= product.lowStockThreshold
    );

    res.json({
      count: lowStockProducts.length,
      products: lowStockProducts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get seller's orders
exports.getMyOrders = async (req, res) => {
  try {
    // Find orders that contain this seller's products
    const orders = await Order.find({
      'items.sellerId': req.user._id
    })
    .populate('customerId', 'name email')
    .sort({ createdAt: -1 });

    // Filter items to show only this seller's products
    const sellerOrders = orders.map(order => {
      const sellerItems = order.items.filter(
        item => item.sellerId.toString() === req.user._id.toString()
      );

      return {
        _id: order._id,
        customerId: order.customerId,
        items: sellerItems,
        status: order.status,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt
      };
    });

    res.json({
      count: sellerOrders.length,
      orders: sellerOrders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update order status (seller perspective)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['processing', 'shipped', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status. Valid: processing, shipped, delivered' 
      });
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if seller has items in this order
    const hasSellerItems = order.items.some(
      item => item.sellerId.toString() === req.user._id.toString()
    );

    if (!hasSellerItems) {
      return res.status(403).json({ 
        message: 'You do not have permission to update this order' 
      });
    }

    order.status = status;
    await order.save();

    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get seller analytics
exports.getSellerAnalytics = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({ 
      sellerId: req.user._id 
    });

    const activeProducts = await Product.countDocuments({ 
      sellerId: req.user._id, 
      isActive: true 
    });

    // Get all products to calculate low stock
    const allProducts = await Product.find({ sellerId: req.user._id });
    const lowStockCount = allProducts.filter(p => 
      p.stock <= p.lowStockThreshold
    ).length;

    // Calculate revenue from completed orders
    const revenue = await Order.aggregate([
      { $unwind: '$items' },
      { 
        $match: { 
          'items.sellerId': req.user._id,
          paymentStatus: 'completed'
        } 
      },
      { 
        $group: { 
          _id: null, 
          total: { 
            $sum: { $multiply: ['$items.price', '$items.quantity'] } 
          } 
        } 
      }
    ]);

    res.json({
      products: {
        total: totalProducts,
        active: activeProducts,
        lowStock: lowStockCount
      },
      revenue: revenue[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user.id });

    if (!seller) {
      return res.status(404).json({ message: 'Seller profile not found' });
    }

    res.json(seller);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};