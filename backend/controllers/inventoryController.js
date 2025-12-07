const InventoryLog = require("../models/Inventory");
const Product = require("../models/Product");

// ✅ FINAL UNIVERSAL INVENTORY HANDLER
exports.applyInventoryChange = async ({
  productId,
  quantity,
  type,                // ✅ NOW ONLY: sale | return | restock | adjustment
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

  // ✅ BUSINESS LOGIC MATCHING MODEL
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
    stockAfter = quantity; // direct override
  }

  // ✅ UPDATE PRODUCT STOCK
  product.stock = stockAfter;
  await product.save();

  // ✅ SAVE INVENTORY LOG (100% MODEL COMPATIBLE)
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
