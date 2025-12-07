const InventoryLog = require("../models/Inventory");
const Product = require("../models/Product");

// ✅ CENTRAL INVENTORY HANDLER (SINGLE SOURCE OF TRUTH)
exports.applyInventoryChange = async ({
  productId,
  quantity,
  type,
  orderId = null,
  performedBy = null,
}) => {
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error("Product not found for inventory update");
  }

  const stockBefore = product.stock;
  let stockAfter = stockBefore;

  // ✅ STRICT FLOW CONTROL
  if (type === "order_placed") {
    if (product.stock < quantity) {
      throw new Error("Insufficient stock");
    }
    stockAfter = stockBefore - quantity;
  } 
  else if (type === "order_cancelled" || type === "order_returned") {
    stockAfter = stockBefore + quantity;
  } 
  else if (type === "manual_add") {
    stockAfter = stockBefore + quantity;
  } 
  else if (type === "manual_remove") {
    if (product.stock < quantity) {
      throw new Error("Insufficient stock for manual removal");
    }
    stockAfter = stockBefore - quantity;
  } 
  else {
    throw new Error("Invalid inventory operation type");
  }

  // ✅ UPDATE PRODUCT STOCK (ONLY HERE)
  product.stock = stockAfter;
  await product.save();

  // ✅ SAVE INVENTORY LOG
  await InventoryLog.create({
    productId,
    type,
    quantity,
    stockBefore,
    stockAfter,
    orderId,
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
exports.getInventoryLogs = async (req, res) => {
  try {
    const logs = await InventoryLog.find()
      .populate("productId", "name")
      .populate("orderId", "_id")
      .populate("performedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
