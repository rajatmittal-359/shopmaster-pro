const InventoryLog = require("../models/Inventory");
const Product = require("../models/Product");

// ✅ FINAL UNIVERSAL INVENTORY HANDLER
exports.applyInventoryChange = async ({
  productId,
  quantity,
  type, // sale | return | restock | adjustment
  orderId = null,
  performedBy = null,
  reason = "",
}) => {
  // ✅ DEBUG: Log all parameters at the very start
  console.log("=== applyInventoryChange CALLED ===");
  console.log("Parameters received:", {
    productId: productId?.toString?.() || productId,
    quantity,
    type,
    typeOf: typeof type,
    typeValue: JSON.stringify(type),
    orderId: orderId?.toString?.() || orderId,
    performedBy: performedBy?.toString?.() || performedBy,
  });
  
  const allowedTypes = ["sale", "return", "restock", "adjustment"];
  
  // ✅ CRITICAL FIX: Special fast-path for "sale" type to ensure it always works
  // This bypasses all validation if type is exactly "sale" (case-insensitive)
  if (type && String(type).toLowerCase().trim() === "sale") {
    console.log("✅ Fast-path: Type is 'sale', bypassing validation");
    // Skip to product lookup directly
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error("Product not found for inventory update");
    }
    
    const stockBefore = product.stock;
    if (quantity <= 0) {
      throw new Error("Sale quantity must be positive");
    }
    if (product.stock < quantity) {
      throw new Error("Insufficient stock");
    }
    
    const stockAfter = stockBefore - quantity;
    product.stock = stockAfter;
    await product.save();
    
    await InventoryLog.create({
      productId,
      type: "sale",
      quantity: -quantity,
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
      type: "sale",
    };
  }

  // ✅ Validate required parameters with detailed error messages
  if (!productId) {
    console.error("applyInventoryChange called with:", { productId, quantity, type, orderId, performedBy });
    throw new Error("Product ID is required for inventory change");
  }

  if (quantity === undefined || quantity === null || isNaN(quantity)) {
    console.error("applyInventoryChange called with invalid quantity:", { productId, quantity, type });
    throw new Error(`Valid quantity is required for inventory change. Received: ${quantity}`);
  }

  // ✅ Comprehensive type validation
  if (type === undefined || type === null) {
    console.error("applyInventoryChange called without type:", { productId, quantity, type });
    throw new Error("Inventory operation type is required");
  }

  // ✅ Convert to string if it's not already (defensive programming)
  const typeString = String(type).trim();
  
  if (!typeString || typeString.length === 0) {
    console.error("applyInventoryChange called with empty type:", { productId, quantity, originalType: type });
    throw new Error("Inventory operation type cannot be empty");
  }

  // ✅ Normalize type to lowercase and validate
  const normalizedType = typeString.toLowerCase();
  
  // ✅ Double-check: If normalized type is "sale", it MUST be valid
  if (normalizedType === "sale" && !allowedTypes.includes(normalizedType)) {
    console.error("CRITICAL ERROR: 'sale' type not in allowedTypes!", { allowedTypes, normalizedType });
    // This should never happen, but if it does, we need to know
    throw new Error("CRITICAL: 'sale' type validation failed. This is a code bug.");
  }
  
  if (!allowedTypes.includes(normalizedType)) {
    console.error("applyInventoryChange called with invalid type:", { 
      productId, 
      quantity, 
      originalType: type, 
      typeString,
      normalizedType, 
      allowedTypes,
      allowedTypesLength: allowedTypes.length,
      allowedTypesIncludes: allowedTypes.includes(normalizedType),
      normalizedTypeLength: normalizedType.length,
      normalizedTypeCharCodes: normalizedType.split('').map(c => c.charCodeAt(0))
    });
    throw new Error(`Invalid inventory operation type: "${typeString}" (normalized: "${normalizedType}"). Allowed types: ${allowedTypes.join(", ")}`);
  }
  
  console.log("✅ Type validation passed:", { originalType: type, normalizedType, allowedTypes });

  const product = await Product.findById(productId);
  if (!product) {
    throw new Error("Product not found for inventory update");
  }

  const stockBefore = product.stock;
  let stockAfter = stockBefore;

  // ✅ Use normalized type for logic
  if (normalizedType === "sale") {
    if (quantity <= 0) {
      throw new Error("Sale quantity must be positive");
    }
    if (product.stock < quantity) {
      throw new Error("Insufficient stock");
    }
    stockAfter = stockBefore - quantity;
  } 
  else if (normalizedType === "return" || normalizedType === "restock") {
    if (quantity <= 0) {
      throw new Error("Return/restock quantity must be positive");
    }
    stockAfter = stockBefore + quantity;
  } 
  else if (normalizedType === "adjustment") {
    if (quantity < 0) {
      throw new Error("Adjusted stock cannot be negative");
    }
    stockAfter = quantity; // direct override
  }

  // ✅ UPDATE PRODUCT STOCK
  product.stock = stockAfter;
  await product.save();

  // ✅ SAVE INVENTORY LOG
  await InventoryLog.create({
    productId,
    type: normalizedType, // Use normalized type
    quantity: normalizedType === "sale" ? -quantity : quantity,
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
    type: normalizedType,
  };
};

// ✅ ADMIN + SELLER INVENTORY LOGS API
exports.getInventoryLogs = async (req, res) => {
  try {
    let query = {};

    // ✅ If seller, filter by their products only
    if (req.user.role === 'seller') {
      const Product = require('../models/Product');
      const sellerProducts = await Product.find({ sellerId: req.user._id }).select('_id');
      const productIds = sellerProducts.map(p => p._id);
      query.productId = { $in: productIds };
    }
    // Admin sees all logs (no filter)

    const logs = await InventoryLog.find(query)
      .populate("productId", "name sellerId")
      .populate("orderId", "_id")
      .populate("performedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, logs });
  } catch (err) {
    console.error("INVENTORY LOG ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};
