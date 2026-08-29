const InventoryLog = require("../models/Inventory");
const Product = require("../models/Product");


exports.applyInventoryChange = async ({
  productId,
  quantity,
  type, // sale | return | restock | adjustment
  orderId = null,
  performedBy = null,
  reason = "",
}) => {
  const allowedTypes = ["sale", "return", "restock", "adjustment"];

  if (!allowedTypes.includes(type)) {
    throw new Error("Invalid inventory operation type");
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new Error("Product not found for inventory update");
  }

  const stockBefore = product.stock;
  let stockAfter = stockBefore;

  if (type === "sale") {
    if (product.stock < quantity) {
      throw new Error("Insufficient stock");
    }
    stockAfter = stockBefore - quantity;
  } 
  else if (type === "return" || type === "restock") {
    stockAfter = stockBefore + quantity;
  } 
  else if (type === "adjustment") {
    stockAfter = quantity;
  }

 
  product.stock = stockAfter;
  await product.save();
  await InventoryLog.create({
    productId,
    type,
    quantity: type === "sale" ? -quantity : quantity,
    stockBefore,
    stockAfter,
    orderId,
    reason,
    performedBy,
  });

  return {
    productId,
    stockBefore,
    stockAfter,
    quantity,
    type,
  };
};

// ✅ ADMIN + SELLER INVENTORY LOGS API
//
// An inventory log has no seller field of its own; ownership is derived through
// productId -> Product.sellerId. A seller therefore only sees logs for products
// they own. Admins keep the platform-wide view, which is the existing intended
// role model (inventoryRoutes allows both roles).
exports.getInventoryLogs = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === "seller") {
      const ownedProductIds = await Product.find({ sellerId: req.user._id })
        .distinct("_id");

      // No products means no logs - never fall through to an unscoped query.
      filter.productId = { $in: ownedProductIds };
    }

    const logs = await InventoryLog.find(filter)
      .populate("productId", "name")
      .populate("orderId", "_id")
      .populate("performedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, logs });
  } catch (err) {
    console.error("INVENTORY LOG ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};


