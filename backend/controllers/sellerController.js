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
 * A seller's catalogue: everything they have not deleted, whether it is
 * currently on sale or not.
 *
 * This used to filter on isActive, which also happens to be the flag the
 * seller's own hide switch writes - so hiding a product removed it from the
 * seller's list entirely and left them no way to put it back. A hidden product
 * is still theirs; only a deleted one leaves.
 */
const sellerCatalogueFilter = (sellerId) => ({ sellerId, isDeleted: { $ne: true } });

/** Of that catalogue, the ones customers can actually see and buy. */
const sellerActiveFilter = (sellerId) => ({ ...sellerCatalogueFilter(sellerId), isActive: true });

/**
 * This seller's parcel within an order.
 *
 * Read paths hand back plain objects (`.lean()`, aggregation results, test
 * doubles) which carry no model methods, so this does not use the document's
 * own fulfilmentFor helper. Write paths, which always hold a real document,
 * still use order.fulfilmentFor.
 */
const fulfilmentOf = (order, sellerId) =>
  (order.fulfilments || []).find((f) => String(f.sellerId) === String(sellerId));

/**
 * What one seller's lines in an order are worth, in the three numbers that
 * matter to them.
 *
 * WHY THIS IS COMPUTED HERE AND NOT IN THE UI
 *   Both seller screens worked this out themselves as `price * quantity` and
 *   called the result "Your Revenue". That is the GROSS - what the customer
 *   paid - and it is not the seller's revenue at all. A seller on the default
 *   8% saw ₹1000 on the order and ₹920 in their payout, with nothing on the
 *   screen to explain the gap. The platform's own store is on 0%, so the two
 *   numbers matched there and the bug stayed invisible while only it was
 *   selling.
 *
 *   The same client-side sum also counted CANCELLED lines, which the seller is
 *   owed nothing for.
 *
 *   Commission is a snapshot taken when the order was placed (see
 *   utils/commission.js). Recomputing it from today's rate would rewrite
 *   history, so this only ever adds up what was stamped on the line.
 */
const sellerMoneyFor = (order, sellerId) => {
  const live = (order.items || []).filter(
    (item) =>
      String(item.sellerId) === String(sellerId) && item.status !== 'cancelled'
  );

  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    /** What the customer paid for these lines. */
    sellerSubtotal: round2(
      live.reduce((sum, i) => sum + i.price * i.quantity, 0)
    ),
    /** The platform's cut, as stamped at the time of sale. */
    sellerCommission: round2(
      live.reduce((sum, i) => sum + (i.commissionAmount || 0), 0)
    ),
    /** What actually reaches the seller. This is the number they care about. */
    sellerEarning: round2(
      live.reduce((sum, i) => sum + (i.sellerEarning || 0), 0)
    ),
  };
};

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

    // Scoped to the catalogue: a deleted product must not be editable. It
    // accepts isActive from the body, so without this a seller could set
    // isActive true on something they had deleted and put it back in the shop
    // while it stayed invisible in their own list.
    const product = await Product.findOne({
      ...sellerCatalogueFilter(req.user.id),
      _id: productId,
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
      ...sellerCatalogueFilter(req.user._id),
      _id: req.params.productId,
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Both flags: isDeleted removes it from the seller's catalogue, isActive
    // keeps every existing "is this on sale" check correct without touching one
    // of them.
    product.isDeleted = true;
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

    // Ownership scope preserved from the previous findOneAndUpdate filter,
    // narrowed to the catalogue so a deleted product cannot be restocked.
    const product = await Product.findOne({
      ...sellerCatalogueFilter(req.user._id),
      _id: productId,
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
    // Same scope and same threshold predicate as the dashboard's low-stock
    // count: products actually on sale. A hidden product running low is not
    // something the seller has to restock today, and counting it would send
    // them hunting for something that is not in the shop.
    const products = await Product.find(
      sellerActiveFilter(req.user._id)
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
      const money = sellerMoneyFor(order, req.user._id);

      const fulfilment = fulfilmentOf(order, req.user._id);

      return {
        _id: order._id,
        // The readable reference the customer will quote on the phone.
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        items: sellerItems,
        ...money,

        /**
         * What THIS seller still has to do. In a split order the order-level
         * status reflects the least advanced seller, so showing that here would
         * tell a seller who has already shipped that they have not.
         */
        status: fulfilment ? fulfilment.status : order.status,
        deliveredAt: fulfilment ? fulfilment.deliveredAt : order.deliveredAt,

        /** Where the whole basket has got to, for context only. */
        orderStatus: order.status,
        isSplitOrder: (order.fulfilments || []).length > 1,

        paymentStatus: order.paymentStatus,
        // Never sent before, so the page's `paymentMethod === 'cod'` test was
        // always false and EVERY order claimed to be paid online - including
        // the COD ones, where the seller has to collect cash at the door.
        paymentMethod: order.paymentMethod,

        /*
         * Whether a courier is already carrying this.
         *
         * Also never sent, and the seller list branches on it twice: it offered
         * "Book courier & ship" on a parcel that was already booked, and never
         * offered "Cancel shipment" at all, because the field it tests was
         * always undefined. Prefer this seller's own AWB - in a split order the
         * two sellers ship separately and have different ones.
         */
        shippingAwb: (fulfilment && fulfilment.awb) || order.shippingAwb || null,
        shippingCourierName:
          (fulfilment && fulfilment.courierName) || order.shippingCourierName || null,

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

    const fulfilment = fulfilmentOf(order, sellerId);

    const orderData = {
      _id: order._id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      items: sellerItems,

      // The money, worked out server-side from the commission snapshot rather
      // than re-derived by the page. See sellerMoneyFor.
      ...sellerMoneyFor(order, sellerId),

      /**
       * How far THIS seller's parcel has got. This used to send the order-level
       * status, which in a split order reflects the least advanced seller - so
       * a seller who had already shipped was told on this very page that they
       * had not. The list page was fixed for this; the details page it links to
       * was still wrong.
       */
      status: fulfilment ? fulfilment.status : order.status,
      deliveredAt: fulfilment ? fulfilment.deliveredAt : order.deliveredAt,

      /** Where the whole basket has got to, for context only. */
      orderStatus: order.status,
      isSplitOrder: (order.fulfilments || []).length > 1,

      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
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


/**
 * Move THIS seller's part of the order forward.
 *
 * A seller owns exactly one fulfilment in an order and may only ever move that
 * one. Previously this wrote the order-level `status`, so in a two-seller order
 * either seller could declare the whole thing shipped or delivered - setting
 * the order's deliveredAt, starting the return window, and making the OTHER
 * seller's lines payable for goods that had never been packed. On COD it also
 * flipped the order to paid for money nobody had collected.
 *
 * The order's own status is derived from all the fulfilments on save, so the
 * customer still sees one coherent status: the least advanced live part.
 *
 * Allowed, forward only: pending -> processing -> shipped -> delivered.
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['processing', 'shipped', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid status. Valid values: processing, shipped, delivered',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ensure this seller is actually part of this order.
    const fulfilment = order.fulfilmentFor(req.user._id);
    if (!fulfilment) {
      return res.status(403).json({
        message: 'You do not have permission to update this order',
      });
    }

    if (['cancelled', 'returned'].includes(fulfilment.status)) {
      return res.status(400).json({
        message: `Your part of this order is already ${fulfilment.status} and cannot be updated`,
      });
    }

    // Forward-only, one step at a time.
    const allowedNext = {
      pending: ['processing'],
      processing: ['shipped'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: [],
      returned: [],
    };

    if (!allowedNext[fulfilment.status].includes(status)) {
      return res.status(400).json({
        message: `Invalid status transition: ${fulfilment.status} -> ${status}`,
      });
    }

    // An unpaid prepaid order is an abandoned checkout, not work to be done.
    if (order.paymentStatus === 'pending' && order.paymentMethod !== 'cod') {
      return res.status(400).json({
        message:
          'Cannot process order - Payment not completed. Customer should retry payment or cancel order.',
      });
    }

    fulfilment.status = status;
    if (status === 'shipped') fulfilment.shippedAt = new Date();
    if (status === 'delivered') fulfilment.deliveredAt = new Date();

    // COD money is only fully collected once every parcel in the basket has
    // been handed over, so the order is marked paid when the LAST seller
    // delivers - never by one seller acting alone. order.status is derived in
    // the model's pre-validate hook, so it is already correct here.
    const everyPartDelivered = order.fulfilments
      .filter((f) => f.status !== 'cancelled')
      .every((f) => ['delivered', 'returned'].includes(f.status));

    if (
      order.paymentMethod === 'cod' &&
      order.paymentStatus === 'pending' &&
      everyPartDelivered
    ) {
      order.paymentStatus = 'paid';
    }

    await order.save();
    res.json({
      message: 'Order status updated successfully',
      fulfilmentStatus: fulfilment.status,
      orderStatus: order.status,
      order,
    });
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
    // A real second number now: the seller can hide a product without deleting
    // it, so these two legitimately differ.
    const activeProducts = await Product.countDocuments(sellerActiveFilter(req.user._id));

    // Low stock only counts what is actually on sale. A hidden product running
    // low is not something the seller has to act on today, and counting it
    // would send them looking for a product that is not in the shop.
    const onSale = await Product.find(sellerActiveFilter(req.user._id));
    const lowStockCount = onSale.filter(isLowStock).length;
    
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
      ...sellerCatalogueFilter(req.user._id),
      _id: req.params.id,
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

    // Record the courier against THIS seller's parcel. In a split order the two
    // sellers ship separately, with different couriers and different AWBs.
    const fulfilment = order.fulfilmentFor(req.user._id);
    if (fulfilment) {
      fulfilment.courierName = courierName;
      fulfilment.awb = trackingNumber;

      // Handing a parcel to a courier means this seller has shipped - but only
      // their own part. The order's status follows from all the fulfilments.
      if (['pending', 'processing'].includes(fulfilment.status)) {
        fulfilment.status = 'shipped';
        fulfilment.shippedAt = new Date();
      }
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
const { cancelOrderFor } = require('../utils/cancelOrder');
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
    })
      .populate('items.productId', 'weight sku')
      // The courier needs a PERSON to hand the parcel to. Without this the
      // booking fell back to the address nickname and shipped parcels
      // addressed to "Home" or "Relative (test delivery)".
      .populate('customerId', 'name');

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

    /*
     * Move THIS SELLER'S parcel to shipped, not just the order.
     *
     * The order's status is DERIVED from its fulfilments (see deriveStatus in
     * models/Order.js). Writing status:'shipped' straight onto the order while
     * the seller's fulfilment still said 'pending' left the two disagreeing -
     * and the next time the document was saved through Mongoose the hook would
     * recompute status from the fulfilments and quietly put it back to pending,
     * on an order whose parcel was already with a courier.
     *
     * In a split order it matters more: only the seller who booked has shipped,
     * and the order as a whole is only as far along as its least advanced part.
     */
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          ...result.update,
          'fulfilments.$[mine].status': 'shipped',
          'fulfilments.$[mine].shippedAt': new Date(),
          'fulfilments.$[mine].courierName': result.update.shippingCourierName,
          'fulfilments.$[mine].awb': result.update.shippingAwb,
        },
      },
      { arrayFilters: [{ 'mine.sellerId': req.user._id }] }
    );

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

/**
 * A seller calling off their own part of an order.
 *
 * There was no way to do this. A seller who found an item out of stock, or
 * broken, or simply could not supply it had one button - "cancel shipment" -
 * which calls off the COURIER and leaves the order sitting there paid for and
 * undeliverable, forever.
 *
 * Every marketplace lets a seller cancel, and treats it as the seller's fault:
 * the customer is refunded in full and the reason is recorded against the
 * seller. That last part is the point - a seller who is repeatedly out of stock
 * is a problem a marketplace has to be able to SEE, which is why the reason is
 * required here and not optional.
 */
exports.cancelOwnLines = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please say why you are cancelling - the customer is told, and it is recorded against your account',
      });
    }

    const order = await Order.findOne({ _id: orderId, 'items.sellerId': req.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // A courier already carrying the parcel has to be called off first,
    // otherwise a rider collects goods for an order that no longer exists.
    if (order.shippingAwb || order.shippingOrderId) {
      return res.status(409).json({
        success: false,
        message: 'Cancel the courier booking first, then cancel the order',
      });
    }

    const result = await cancelOrderFor(order, {
      by: 'seller',
      actorId: req.user._id,
      reason: String(reason).trim(),
      sellerId: req.user._id,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }
    return res.json({ success: true, message: result.message });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
