// backend/controllers/adminController.js
const { sendError } = require('../utils/apiError');
const mongoose = require('mongoose');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { cancelOrderFor } = require('../utils/cancelOrder');

/**
 * SELLER MANAGEMENT
 */

// Get all pending sellers (awaiting approval)
exports.getAllSellers = async (req, res) => {
  try {
    const allSellers = await Seller.find({})
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
    
    res.json({ count: allSellers.length, sellers: allSellers });
  } catch (error) {
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    return sendError(res, error);
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
    return sendError(res, error);
  }
};

/**
 * CATEGORY MANAGEMENT
 */

/**
 * Create a category.
 *
 * TWO RULES, both of them about a category being a place products can live.
 *
 * 1. A MAIN CATEGORY IS A CONTAINER, NOT A SHELF.
 *    Products must sit on a leaf (see sellerController.validateLeafCategory),
 *    so a main category with no subcategories is a dead end: it shows up in the
 *    shop filter and nothing can ever be listed under it. Creating one now
 *    takes its subcategories with it, in the same request.
 *
 * 2. A CATEGORY HOLDING PRODUCTS CANNOT BECOME A PARENT.
 *    Nothing used to stop this. Give a subcategory to a category that already
 *    has products and those products are instantly sitting on a non-leaf - the
 *    exact state the leaf rule exists to prevent - and the seller cannot save
 *    an edit to them any more without moving them first. Move the products,
 *    then add the subcategory.
 */
exports.createCategory = async (req, res) => {
  try {
    const { name, description, parentCategory } = req.body;

    // Names of the subcategories to create alongside a new main category.
    const subcategories = Array.isArray(req.body.subcategories)
      ? req.body.subcategories.map((n) => String(n).trim()).filter(Boolean)
      : [];

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    if (parentCategory) {
      const parentExists = await Category.findById(parentCategory);
      if (!parentExists) {
        return res.status(400).json({ message: 'Invalid parent category' });
      }

      // Max 2 levels.
      if (parentExists.parentCategory) {
        return res.status(400).json({
          message: 'Cannot create subcategory under another subcategory. Maximum 2 levels allowed.',
        });
      }

      // Rule 2.
      const held = await Product.countDocuments({
        category: parentCategory,
        isDeleted: { $ne: true },
      });
      if (held > 0) {
        return res.status(400).json({
          message:
            `"${parentExists.name}" already has ${held} product(s) listed directly in it. ` +
            'Move them into a subcategory first, then add subcategories here.',
        });
      }
    } else if (subcategories.length === 0) {
      // Rule 1.
      return res.status(400).json({
        message:
          'A main category needs at least one subcategory. Products are listed in subcategories, ' +
          'so a main category on its own is a heading nothing can go under.',
      });
    }

    const category = await Category.create({
      name,
      description,
      parentCategory: parentCategory || null,
      createdBy: req.user._id,
    });

    // Children are created after the parent so they inherit the right
    // ancestors. One that collides with an existing name is reported rather
    // than silently dropped.
    const created = [];
    const skipped = [];

    for (const childName of subcategories) {
      try {
        const child = await Category.create({
          name: childName,
          parentCategory: category._id,
          createdBy: req.user._id,
        });
        created.push(child);
      } catch (err) {
        skipped.push(childName);
        if (err.code !== 11000) throw err;
      }
    }

    await category.populate('parentCategory', 'name');

    res.status(201).json({
      message: skipped.length
        ? `Category created. These already existed and were skipped: ${skipped.join(', ')}`
        : 'Category created successfully',
      category,
      subcategories: created,
      skipped,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    sendError(res, error);
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find()
      .populate('createdBy', 'name')
      .populate('parentCategory', 'name')
      .sort({ name: 1 })
      .lean();

    // How many products sit in each one, counted in a single pass. Without
    // this the admin is asked to delete a category with no idea what is in it,
    // and an empty branch is invisible.
    const counts = await Product.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$category', n: { $sum: 1 } } },
    ]);
    const productCount = new Map(counts.map((c) => [String(c._id), c.n]));

    const withCounts = categories.map((c) => ({
      ...c,
      productCount: productCount.get(String(c._id)) || 0,
    }));

    const mainCategories = withCounts.filter((c) => !c.parentCategory);
    const subCategories = withCounts.filter((c) => c.parentCategory);

    res.json({
      count: withCounts.length,
      mainCategories: mainCategories.length,
      subCategories: subCategories.length,
      categories: withCounts,
    });
  } catch (error) {
    sendError(res, error);
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

    // findByIdAndUpdate bypasses the pre('save') hook, so the materialized
    // path and slug are computed explicitly here to stay consistent.
    const update = { name, description, isActive };
    if (parentCategory !== undefined) {
      update.parentCategory = parentCategory || null;
      update.ancestors = await Category.buildAncestors(parentCategory || null);
    }
    if (name) update.slug = Category.slugify(name);

    const category = await Category.findByIdAndUpdate(
      categoryId,
      update,
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
    sendError(res, error);
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
    sendError(res, error);
  }
};


/**
 * ORDER OPERATIONS (read-only platform visibility)
 *
 * The admin previously had no order endpoint at all, so the platform operator
 * could not investigate a disputed order. Seller and customer order routes stay
 * scoped as they are; this is an additional admin-scoped view, not a relaxation
 * of those boundaries.
 */

// Get platform orders (paginated, optionally filtered)
exports.getAllOrders = async (req, res) => {
  try {
    const { status, paymentStatus, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const numericPage = Math.max(Number(page) || 1, 1);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('customerId', 'name email')
        .populate('items.sellerId', 'name email')
        .sort({ createdAt: -1 })
        .limit(numericLimit)
        .skip((numericPage - 1) * numericLimit),
      Order.countDocuments(filter),
    ]);

    res.json({
      orders,
      total,
      currentPage: numericPage,
      totalPages: Math.ceil(total / numericLimit),
    });
  } catch (error) {
    sendError(res, error);
  }
};

// Get a single order in full (admin sees every seller's items, unlike the
// seller view which filters items down to that seller's own)
exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const order = await Order.findById(orderId)
      .populate('customerId', 'name email')
      .populate('items.sellerId', 'name email')
      .populate('items.productId', 'name images')
      .populate('shippingAddressId');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * PLATFORM ANALYTICS (STEP-6 ENHANCED)
 */

exports.getAnalytics = async (req, res) => {
  try {
    // ---------- BASIC COUNTS ----------
    // `ordersToday` really is today. The dashboard used to label the all-time
    // order count "Orders Today / Last 24 hours", which was simply false - it
    // read 10 while the newest order was a week old.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [approvedSellers, pendingSellers, totalProducts, totalOrders, ordersToday] =
      await Promise.all([
        Seller.countDocuments({ isApproved: true }),
        Seller.countDocuments({ isApproved: false }),
        Product.countDocuments({ isDeleted: { $ne: true } }),
        Order.countDocuments(),
        Order.countDocuments({ createdAt: { $gte: dayAgo } }),
      ]);
    
    /**
     * Two different numbers, and the dashboard was showing the wrong one.
     *
     *   grossSales  everything customers paid - other sellers' money included
     *   revenue     the platform's own take, which is the commission
     *
     * "Platform Revenue: Rs18,496" was gross sales. The platform's actual
     * earnings on that are the commission alone - and Rs0 of it on the family
     * shop's own sales, which are set to 0%. Reading one as the other
     * overstates what the business earns by an order of magnitude.
     *
     * Commission is summed from the snapshot already on each order line
     * (utils/commission.js); nothing is recalculated here. Cancelled lines are
     * excluded because they were refunded.
     */
    const [grossAgg, commissionAgg] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $unwind: '$items' },
        { $match: { 'items.status': { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$items.commissionAmount' } } },
      ]),
    ]);

    const grossSales = grossAgg[0]?.total || 0;
    const commissionEarned = Math.round((commissionAgg[0]?.total || 0) * 100) / 100;
    
    // ---------- REVENUE BY DAY (LAST 7 DAYS) ----------
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 6); // today + last 6 days
    
    const revenueByDayAgg = await Order.aggregate([
      { 
    $match: { 
      paymentStatus: { $in: ['paid', 'completed'] },  // ← yaha
      createdAt: { $gte: sevenDaysAgo }
    }
  },
      { 
        $group: { 
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }},
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 }}
    ]);
    
    const revenueByDay = revenueByDayAgg.map(d => ({
      date: d._id,
      total: d.total,
      orders: d.count,
    }));
    
    // ---------- TOP SELLERS BY REVENUE ----------
    const topSellersAgg = await Order.aggregate([
        { 
    $match: { 
      paymentStatus: { $in: ['paid', 'completed'] }   // ← yaha
    }
  }, // ✅ Includes COD after delivery
      { $unwind: '$items' },
      { 
        $group: { 
          _id: '$items.sellerId',
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] }},
          itemsSold: { $sum: '$items.quantity' }
        }
      },
      { $sort: { revenue: -1 }},
      { $limit: 5 },
      { 
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'seller'
        }
      },
      { $unwind: '$seller' },
      { 
        $project: {
          _id: 1,
          revenue: 1,
          itemsSold: 1,
          sellerName: '$seller.name',
          sellerEmail: '$seller.email'
        }
      }
    ]);
    const topSellers = topSellersAgg;
    
    // ---------- GLOBAL LOW STOCK LIST ----------
    const lowStockProducts = await Product.find({
      isActive: true,
      $expr: { $lte: ['$stock', '$lowStockThreshold'] }
    })
    .populate('sellerId', 'name email')
    .populate('category', 'name')
    .sort({ stock: 1 })
    .limit(10);
    
    const lowStockGlobal = lowStockProducts.map(p => ({
      _id: p._id,
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
        // Every seller on the platform, plus the two states separately. `total`
        // used to be the approved count alone, so the dashboard read 4 while
        // Manage Sellers listed 5.
        total: approvedSellers + pendingSellers,
        approved: approvedSellers,
        pending: pendingSellers,
      },
      products: totalProducts,
      orders: totalOrders,
      ordersToday,

      // What the platform actually earns: commission, not what customers spent.
      revenue: commissionEarned,
      grossSales,
      
      // new advanced analytics (future UI use ke liye ready)
      revenueByDay, // ✅ Now includes COD
      topSellers, // ✅ Now includes COD sellers
      lowStockGlobal,
    });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * The platform calling off an order.
 *
 * The admin could LOOK at orders and do nothing about them - there were two
 * read endpoints and no way to act. That is the one role that has to be able
 * to act: when a seller has gone quiet, when a customer cannot get through to
 * them, when something has plainly gone wrong, somebody has to be able to
 * refund the customer and close it.
 *
 * The whole order goes, not one seller's part: an admin stepping in is the
 * platform overriding everyone, and leaving half of it live would be a worse
 * outcome than either cancelling or not.
 */
exports.cancelOrderAsAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'A reason is required - it is shown to the customer and kept on the order',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.shippingAwb || order.shippingOrderId) {
      return res.status(409).json({
        success: false,
        message: 'A courier is booked for this order. It has to be called off before the order can be cancelled.',
      });
    }

    const result = await cancelOrderFor(order, {
      by: 'admin',
      actorId: req.user._id,
      reason: String(reason).trim(),
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }
    return res.json({ success: true, message: result.message });
  } catch (error) {
    return sendError(res, error);
  }
};
