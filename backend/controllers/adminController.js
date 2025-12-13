// backend/controllers/adminController.js
const User = require('../models/User');
const Seller = require('../models/Seller');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');

/**
 * SELLER MANAGEMENT
 */

// Get all pending sellers (awaiting approval)
exports.getPendingSellers = async (req, res) => {
  try {
    const pendingSellers = await Seller.find({ isApproved: false })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      count: pendingSellers.length,
      sellers: pendingSellers,
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
      seller,
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
      seller,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Suspend seller
exports.suspendSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { reason } = req.body;

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    seller.status = 'suspended';
    seller.suspensionReason = reason || '';
    await seller.save();

    return res.json({ message: 'Seller suspended successfully', seller });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Activate seller
exports.activateSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    seller.status = 'active';
    seller.suspensionReason = '';
    await seller.save();

    return res.json({ message: 'Seller activated successfully', seller });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * CATEGORY MANAGEMENT
 */

// Create category
// Create category (with optional parent support)
exports.createCategory = async (req, res) => {
  try {
    const { name, description, parentCategory } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    // ✅ Validate parent category if provided
    if (parentCategory) {
      const parentExists = await Category.findById(parentCategory);
      if (!parentExists) {
        return res.status(400).json({ message: 'Invalid parent category' });
      }
      // ✅ Prevent creating subcategory under another subcategory (max 2 levels)
      if (parentExists.parentCategory) {
        return res.status(400).json({ 
          message: 'Cannot create subcategory under another subcategory. Maximum 2 levels allowed.' 
        });
      }
    }

    const category = await Category.create({
      name,
      description,
      parentCategory: parentCategory || null,
      createdBy: req.user._id,
    });

    // ✅ Populate parent in response
    await category.populate('parentCategory', 'name');

    res.status(201).json({
      message: 'Category created successfully',
      category,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};


// Get all categories (with parent info and hierarchy stats)
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find()
      .populate('createdBy', 'name')
      .populate('parentCategory', 'name')
      .sort({ name: 1 });

    // ✅ Calculate hierarchy stats
    const mainCategories = categories.filter(c => !c.parentCategory);
    const subCategories = categories.filter(c => c.parentCategory);

    res.json({
      count: categories.length,
      mainCategories: mainCategories.length,
      subCategories: subCategories.length,
      categories,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Update category
// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, isActive, parentCategory } = req.body;

    // ✅ Validate parent if changing
    if (parentCategory) {
      if (parentCategory === categoryId) {
        return res.status(400).json({ message: 'Category cannot be its own parent' });
      }

      const parentExists = await Category.findById(parentCategory);
      if (!parentExists) {
        return res.status(400).json({ message: 'Invalid parent category' });
      }

      // ✅ Prevent creating 3-level hierarchy
      if (parentExists.parentCategory) {
        return res.status(400).json({ 
          message: 'Cannot set a subcategory as parent. Maximum 2 levels allowed.' 
        });
      }

      // ✅ Prevent circular reference (if this category has children)
      const hasChildren = await Category.findOne({ parentCategory: categoryId });
      if (hasChildren) {
        return res.status(400).json({ 
          message: 'Cannot convert a parent category to subcategory. It has existing subcategories.' 
        });
      }
    }

    const category = await Category.findByIdAndUpdate(
      categoryId,
      { name, description, isActive, parentCategory: parentCategory || null },
      { new: true, runValidators: true }
    ).populate('parentCategory', 'name');

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      message: 'Category updated successfully',
      category,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete category

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // ✅ Check if category has products
    const productsCount = await Product.countDocuments({ category: categoryId });
    if (productsCount > 0) {
      return res.status(400).json({
        message: `Cannot delete category. ${productsCount} products are using it.`,
      });
    }

    // ✅ Check if category has subcategories
    const subCategoriesCount = await Category.countDocuments({ parentCategory: categoryId });
    if (subCategoriesCount > 0) {
      return res.status(400).json({
        message: `Cannot delete category. It has ${subCategoriesCount} subcategories. Delete them first.`,
      });
    }

    const category = await Category.findByIdAndDelete(categoryId);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      message: 'Category deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * PLATFORM ANALYTICS (STEP-6 ENHANCED)
 */

exports.getAnalytics = async (req, res) => {
  try {
    // ---------- BASIC COUNTS ----------
    const [totalSellers, pendingSellers, totalProducts, totalOrders] =
      await Promise.all([
        Seller.countDocuments({ isApproved: true }),
        Seller.countDocuments({ isApproved: false }),
        Product.countDocuments(),
        Order.countDocuments(),
      ]);

    const totalRevenueAgg = await Order.aggregate([
      { $match: { paymentStatus: 'completed' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
        },
      },
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;

    // ---------- REVENUE BY DAY (LAST 7 DAYS) ----------
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 6); // today + last 6 days

    const revenueByDayAgg = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'completed',
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const revenueByDay = revenueByDayAgg.map((d) => ({
      date: d._id,
      total: d.total,
      orders: d.count,
    }));

    // ---------- TOP SELLERS BY REVENUE ----------
    const topSellersAgg = await Order.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.sellerId',
          revenue: {
            $sum: { $multiply: ['$items.price', '$items.quantity'] },
          },
          itemsSold: { $sum: '$items.quantity' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'seller',
        },
      },
      { $unwind: '$seller' },
      {
        $project: {
          _id: 1,
          revenue: 1,
          itemsSold: 1,
          sellerName: '$seller.name',
          sellerEmail: '$seller.email',
        },
      },
    ]);

    const topSellers = topSellersAgg;

    // ---------- GLOBAL LOW STOCK LIST ----------
    const lowStockProducts = await Product.find({
      isActive: true,
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
    })
      .populate('sellerId', 'name email')
      .populate('category', 'name')
      .sort({ stock: 1 })
      .limit(10);

    const lowStockGlobal = lowStockProducts.map((p) => ({
      id: p._id,
      name: p.name,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      sellerName: p.sellerId?.name,
      sellerEmail: p.sellerId?.email,
      category: p.category?.name,
    }));

    // ---------- RESPONSE (BACKWARD COMPATIBLE) ----------
    res.json({
      // old structure (AdminDashboard.jsx already use karta hai)
      sellers: {
        total: totalSellers,
        pending: pendingSellers,
      },
      products: totalProducts,
      orders: totalOrders,
      revenue: totalRevenue,

      // new advanced analytics (future UI use ke liye ready)
      revenueByDay,
      topSellers,
      lowStockGlobal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
