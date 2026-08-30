// backend/controllers/sellerController.js
const { sendError } = require('../utils/apiError');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Seller = require('../models/Seller');
const InventoryLog = require('../models/Inventory');
const Category = require('../models/Category');
const mongoose = require('mongoose');
// Held as a module object rather than destructured, so the upload can be
// stood in for. Tests must be able to prove that nothing is uploaded before
// the product has been checked, and a destructured copy cannot be replaced.
const cloudinary = require('../utils/cloudinary');
const { deleteImage } = cloudinary;

/**
 * A seller's catalogue is their non-deleted products. deleteProduct() is a soft
 * delete and there is no seller-facing way to view or restore removed products,
 * so every count shown on the dashboard is scoped to what the seller can
 * actually inspect in their product list.
 */
const sellerCatalogueFilter = (sellerId) => ({ sellerId, isActive: true });

/**
 * "Low stock" means at or below the seller's own alert threshold.
 * '<=' is the definition already used by admin analytics, the low-stock cron
 * job and the storefront badge. The seller dashboard previously used '<' and
 * therefore disagreed with its own low-stock list.
 */
const isLowStock = (product) => product.stock <= product.lowStockThreshold;

/**
 * Record a seller-initiated manual stock change in the inventory audit trail.
 *
 * Order-driven stock movements already write InventoryLog rows; seller-initiated
 * edits did not, so the "Inventory Logs" page was missing exactly the
 * "manual adjustments" it claims to show.
 *
 * quantity is stored as the DELTA, matching how 'sale' (negative) and
 * 'return'/'restock' (positive) are already recorded, so the logs page can
 * render every row the same way.
 *
 * Returns null when nothing actually changed, so a no-op edit logs nothing.
 */
const logStockAdjustment = async ({
  productId,
  stockBefore,
  stockAfter,
  performedBy,
  reason,
}) => {
  if (stockBefore === stockAfter) return null;

  return InventoryLog.create({
    productId,
    type: 'adjustment',
    quantity: stockAfter - stockBefore,
    stockBefore,
    stockAfter,
    performedBy,
    reason: reason || 'Manual stock update by seller',
  });
};

/**
 * Products must sit on a leaf category.
 *
 * A parent category is a container: its products are the union of its
 * descendants. Allowing a product to be pinned directly to a parent creates
 * items that belong to a branch and a leaf at once, which no rollup can
 * represent consistently. Amazon/Flipkart apply the same rule.
 *
 * Returns an error message, or null when the category is acceptable.
 */
const validateLeafCategory = async (categoryId) => {
  if (!categoryId) return null;
  if (!mongoose.isValidObjectId(categoryId)) return 'Invalid category';

  const category = await Category.findById(categoryId).select('name isActive').lean();
  if (!category) return 'Category not found';
  if (category.isActive === false) return `Category "${category.name}" is not active`;

  if (await Category.hasChildren(categoryId)) {
    return `"${category.name}" is a main category. Please choose one of its subcategories.`;
  }
  return null;
};

/** Accept only a non-negative integer stock value. */
const parseStock = (raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, message: 'Stock is required' };
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { ok: false, message: 'Stock must be a number' };
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return { ok: false, message: 'Stock must be a whole number' };
  }
  if (value < 0) {
    return { ok: false, message: 'Stock cannot be negative' };
  }
  return { ok: true, value };
};

/**
 * SELLER PRODUCTS
 */

// Get seller's products
exports.getMyProducts = async (req, res) => {
  try {
    const products = await Product.find(sellerCatalogueFilter(req.user._id))
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    res.json({
      count: products.length,
      products,
    });
  } catch (error) {
    sendError(res, error);
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
      freeShipping,
      images, // base64 array
      brand,
      sku,
      mrp,
      tags,
    } = req.body;

    const categoryError = await validateLeafCategory(category);
    if (categoryError) {
      return res.status(400).json({ message: categoryError });
    }

    const product = new Product({
      name,
      description,
      category,
      price,
      stock,
      lowStockThreshold: typeof lowStockThreshold === 'number' ? lowStockThreshold : 10,
      // The seller chooses to absorb delivery on this product.
      freeShipping: freeShipping === true,

      sellerId: req.user._id,
      isActive: true,
      brand,
      sku,
      mrp,
      tags,
    });

    // Check the details BEFORE spending anything on the pictures. Uploading
    // first meant every rejected product left its images sitting in Cloudinary
    // for good: paid-for storage attached to a product that never existed.
    const invalid = product.validateSync();
    if (invalid) return sendError(res, invalid);

    if (images && images.length > 0) {
      for (const img of images) {
        const uploaded = await cloudinary.uploadImage(img);
        product.images.push(uploaded.url);
      }
    }

    await product.save();

    res.status(201).json({ message: 'Product created', product });
  } catch (error) {
    sendError(res, error);
  }
};

// Update product
// backend/controllers/sellerController.js

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
      weight,
      freeShipping,
    } = req.body;

    const product = await Product.findOne({
      _id: productId,
      sellerId: req.user.id,
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found or you do not have permission",
      });
    }

    if (category) {
      const categoryError = await validateLeafCategory(category);
      if (categoryError) {
        return res.status(400).json({ message: categoryError });
      }
    }

    // Captured before mutation so a stock edit made through the product form
    // is audited the same way as one made through the stock endpoint.
    const stockBefore = product.stock;

    // Update scalar fields
    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;
    if (isActive !== undefined) product.isActive = isActive;
    if (typeof lowStockThreshold === 'number') {
  product.lowStockThreshold = lowStockThreshold;
};
    if (brand !== undefined) product.brand = brand;
    if (sku !== undefined) product.sku = sku;
    if (mrp !== undefined) product.mrp = mrp;
    if (Array.isArray(tags)) product.tags = tags;
    if (weight !== undefined) product.weight = weight;
    // Only an explicit boolean flips it, so an absent field never silently
    // turns free delivery off on an existing product.
    if (typeof freeShipping === 'boolean') product.freeShipping = freeShipping;

    // Images handling (existing code...)
    if (Array.isArray(req.body.images) && req.body.images.length > 0) {
      const incomingImages = req.body.images;
      const finalImages = [];

      for (const img of incomingImages) {
        if (typeof img === "string" && img.startsWith("data:image/")) {
          const uploaded = await cloudinary.uploadImage(img);
          finalImages.push(uploaded.url);
        } else if (typeof img === "string" && img.trim() !== "") {
          finalImages.push(img);
        }
      }

      product.images = finalImages;
    }

    await product.save();

    // No-ops are ignored by logStockAdjustment, so editing other fields does
    // not produce a spurious inventory entry.
    await logStockAdjustment({
      productId: product._id,
      stockBefore,
      stockAfter: product.stock,
      performedBy: req.user._id,
      reason: 'Stock changed via product edit',
    });

    await product.populate("category", "name");

    res.json({
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    sendError(res, error);
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
    sendError(res, error);
  }
};

// Update stock manually
exports.updateStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { stock, reason } = req.body;

    const parsed = parseStock(stock);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    // Ownership scope preserved from the previous findOneAndUpdate filter.
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
    product.stock = parsed.value;
    await product.save();

    await logStockAdjustment({
      productId: product._id,
      stockBefore,
      stockAfter: product.stock,
      performedBy: req.user._id,
      reason,
    });

    await product.populate('category', 'name');

    res.json({
      message: 'Stock updated successfully',
      product,
      lowStockAlert: product.stock <= product.lowStockThreshold,
    });
  } catch (error) {
    sendError(res, error);
  }
};

// Get low stock products
exports.getLowStockProducts = async (req, res) => {
  try {
    // Same catalogue scope and same threshold predicate as the dashboard count.
    const products = await Product.find(
      sellerCatalogueFilter(req.user._id)
    ).populate('category', 'name');

    const lowStockProducts = products.filter(isLowStock);

    res.json({
      count: lowStockProducts.length,
      products: lowStockProducts,
    });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * SELLER ORDERS – STEP-5A CORE
 */

// Get orders that contain this seller's products
exports.getMyOrders = async (req, res) => {
  try {
    // A prepaid order that was never paid is an abandoned checkout, not work.
    // Those records are created up-front by createRazorpayOrder and previously
    // sat in the seller's queue forever with nothing to act on. COD orders are
    // actionable from creation, so only unpaid razorpay orders are excluded.
    const orders = await Order.find({
      "items.sellerId": req.user._id,
      $or: [
        { paymentMethod: { $ne: "razorpay" } },
        { paymentStatus: { $ne: "pending" } },
      ],
    })
      .populate("customerId", "name email")
      .sort({ createdAt: -1 });

    const sellerOrders = orders.map((order) => {
      const sellerItems = order.items.filter(
        (item) => item.sellerId.toString() === req.user._id.toString()
      );

      // What this seller is owed for their own lines. The order's totalAmount
      // belongs to the whole basket, which in a multi-seller order is other
      // sellers' money too - showing it here would overstate their earnings.
      const sellerSubtotal = sellerItems.reduce(
        (sum, item) => (item.status === 'cancelled' ? sum : sum + item.price * item.quantity),
        0
      );
      const sellerEarning = sellerItems.reduce(
        (sum, item) => (item.status === 'cancelled' ? sum : sum + (item.sellerEarning || 0)),
        0
      );

      return {
        _id: order._id,
        // The readable reference the customer will quote on the phone.
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        items: sellerItems,
        sellerSubtotal,
        sellerEarning,
        status: order.status,
        paymentStatus: order.paymentStatus,
        trackingInfo: order.trackingInfo,
        createdAt: order.createdAt,
      };
    });

    res.json({ count: sellerOrders.length, orders: sellerOrders });
  } catch (error) {
    sendError(res, error);
  }
};

// Get single order details for seller
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const sellerId = req.user._id;

    const order = await Order.findById(orderId)
      .populate("customerId", "name email")
      .populate("shippingAddressId");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify this order has items from this seller
    const hasSellerItems = order.items.some(
      (item) => item.sellerId.toString() === sellerId.toString()
    );

    if (!hasSellerItems) {
      return res.status(403).json({ message: "Access denied to this order" });
    }

    // Filter items - only show this seller's items
    const sellerItems = order.items.filter(
      (item) => item.sellerId.toString() === sellerId.toString()
    );

    const orderData = {
      _id: order._id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      items: sellerItems,
      status: order.status,
      paymentStatus: order.paymentStatus,
      shippingAddressId: order.shippingAddressId,
      trackingInfo: order.trackingInfo,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    res.json({ success: true, order: orderData });
  } catch (error) {
    sendError(res, error);
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
        message: 'Invalid status. Valid values: processing, shipped, delivered' 
      });
    }
    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check order already cancelled/returned
    if (['cancelled', 'returned'].includes(order.status)) {
      return res.status(400).json({ 
        message: `Order is already ${order.status} and cannot be updated` 
      });
    }
    
    // Ensure this seller is part of this order
    const hasSellerItems = order.items.some(
      item => item.sellerId.toString() === req.user._id.toString()
    );
    if (!hasSellerItems) {
      return res.status(403).json({ 
        message: 'You do not have permission to update this order' 
      });
    }
    
    // Enforce forward-only transitions
    const allowedNext = {
      'pending': ['processing'],
      'processing': ['shipped'],
      'shipped': ['delivered'],
      'delivered': [],
      'cancelled': [],
      'returned': []
    };
    
    const currentStatus = order.status;
    const allowedForCurrent = allowedNext[currentStatus];
    if (!allowedForCurrent.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status transition: ${currentStatus} -> ${status}` 
      });
    }
     // ✅ ADD VALIDATION
  // Block status change if payment pending AND method is online
  if (order.paymentStatus === 'pending' && order.paymentMethod !== 'cod') {
    return res.status(400).json({
      message: 'Cannot process order - Payment not completed. Customer should retry payment or cancel order.'
    });
  }
  
    // Apply new status
    order.status = status;
    
if (status === 'delivered') {
  // COD: Mark payment as received when delivered
  if (order.paymentMethod === 'cod' && order.paymentStatus === 'pending') {
    order.paymentStatus = 'paid';
  }
  // Online: Already paid, no change needed
}

    
    await order.save();
    res.json({ message: 'Order status updated successfully', order });
  } catch (error) {
    sendError(res, error);
  }
};


/**
 * SELLER ANALYTICS & PROFILE
 */

// Get seller analytics (products + revenue)
exports.getSellerAnalytics = async (req, res) => {
  try {
    // Scoped to the seller's catalogue so these counts match /seller/products.
    const catalogue = sellerCatalogueFilter(req.user._id);

    const totalProducts = await Product.countDocuments(catalogue);
    const activeProducts = await Product.countDocuments(catalogue);

    const catalogueProducts = await Product.find(catalogue);
    const lowStockCount = catalogueProducts.filter(isLowStock).length;
    
    // ✅ FIXED: Revenue from completed orders (both COD delivered + Razorpay paid)
    const revenue = await Order.aggregate([
      { $unwind: '$items' },
      { 
        $match: { 
          'items.sellerId': req.user._id, 
          paymentStatus: { $in: ["paid", "completed"] }  // ✅ Now works after delivery
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$items.price', '$items.quantity'] }}
        }
      }
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
    sendError(res, error);
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

// --------------------------------------------------------------- shipping

const shipment = require('../utils/shipmentBooking');
const Address = require('../models/Address');

/**
 * Books a courier for an order that is packed and ready.
 *
 * Deliberately a seller action rather than something that happens at checkout:
 * until this is pressed, no courier knows the order exists, so a mistaken or
 * fraudulent order can be cancelled with nothing to undo.
 *
 * Whatever the customer paid for is what gets booked - same-day goes by
 * hyperlocal rider, standard by courier.
 */
exports.shipOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    // Scoped to this seller's own lines, so one seller cannot ship another's order.
    const order = await Order.findOne({
      _id: orderId,
      'items.sellerId': req.user._id,
    }).populate('items.productId', 'weight sku');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // A prepaid order that has not been paid for must not be shipped.
    if (order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'This order has not been paid for yet',
      });
    }

    const address = await Address.findById(order.shippingAddressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Delivery address is missing' });
    }

    const result = await shipment.bookForOrder(order, address);

    if (!result.ok) {
      // Store any ids a half-finished booking left behind, so a shipment that
      // exists at the courier is never invisible here.
      if (result.update) await Order.updateOne({ _id: order._id }, { $set: result.update });
      return res.status(409).json({ success: false, message: result.reason });
    }

    await Order.updateOne({ _id: order._id }, { $set: result.update });

    res.json({
      success: true,
      message: result.pickupScheduled
        ? 'Courier booked and pickup requested'
        : 'Courier booked. Pickup could not be scheduled - request it from the courier dashboard.',
      tracking: {
        courierName: result.update.shippingCourierName,
        trackingNumber: result.update.shippingAwb,
        trackingUrl: result.update.shippingTrackingUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Calls the courier off, while that is still possible.
 *
 * Both couriers refuse once the parcel has been collected, which is the honest
 * point of no return.
 */
exports.cancelShipment = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await Order.findOne({ _id: orderId, 'items.sellerId': req.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const result = await shipment.cancelForOrder(order);
    if (!result.ok) {
      return res.status(409).json({ success: false, message: result.reason });
    }

    await Order.updateOne({ _id: order._id }, { $set: result.update });

    res.json({ success: true, message: 'Shipment cancelled; the order is back to processing' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
