const User = require('../models/User');
const Seller = require('../models/Seller');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Get all pending sellers (awaiting approval)
exports.getPendingSellers = async (req, res) => {
  try {
    const pendingSellers = await Seller.find({ isApproved: false })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      count: pendingSellers.length,
      sellers: pendingSellers
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Approve seller
exports.approveSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await Seller.findByIdAndUpdate(
      sellerId,
      { isApproved: true, kycStatus: 'verified' },
      { new: true }
    ).populate('userId', 'name email');

    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    res.json({
      message: 'Seller approved successfully',
      seller
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reject seller
exports.rejectSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await Seller.findByIdAndUpdate(
      sellerId,
      { isApproved: false, kycStatus: 'rejected' },
      { new: true }
    ).populate('userId', 'name email');

    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    res.json({
      message: 'Seller rejected',
      seller
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const category = await Category.create({
      name,
      description,
      createdBy: req.user._id
    });

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};

// Get all categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find()
      .populate('createdBy', 'name')
      .sort({ name: 1 });

    res.json({
      count: categories.length,
      categories
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, isActive } = req.body;

    const category = await Category.findByIdAndUpdate(
      categoryId,
      { name, description, isActive },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Check if any products use this category
    const productsCount = await Product.countDocuments({ category: categoryId });
    if (productsCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category. ${productsCount} products are using it.` 
      });
    }

    const category = await Category.findByIdAndDelete(categoryId);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      message: 'Category deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get platform analytics
exports.getAnalytics = async (req, res) => {
  try {
    const totalSellers = await Seller.countDocuments({ isApproved: true });
    const pendingSellers = await Seller.countDocuments({ isApproved: false });
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    
    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      sellers: {
        total: totalSellers,
        pending: pendingSellers
      },
      products: totalProducts,
      orders: totalOrders,
      revenue: totalRevenue[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
