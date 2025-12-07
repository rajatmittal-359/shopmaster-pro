const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  checkout,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  returnOrder,
} = require("../controllers/customerController");

const {
  addAddress,
  getMyAddresses,
  updateAddress,
  deleteAddress,
} = require("../controllers/addressController");

const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
} = require("../controllers/wishlistController");

// ✅ TEST
router.get("/test", (req, res) => res.json({ ok: true }));

// ✅ DEBUG: Check inventory function version
router.get("/debug/inventory-check", (req, res) => {
  const { applyInventoryChange } = require("../controllers/inventoryController");
  const funcStr = applyInventoryChange.toString();
  const hasFastPath = funcStr.includes("Fast-path: Type is 'sale'");
  const hasValidation = funcStr.includes("allowedTypes.includes");
  
  res.json({
    message: "Inventory function check",
    hasFastPath,
    hasValidation,
    functionLength: funcStr.length,
    timestamp: new Date().toISOString(),
  });
});

// ✅ PROTECTED CUSTOMER
router.use(authMiddleware, roleMiddleware("customer"));

// ✅ CART
router.get("/cart", getCart);
router.post("/cart", addToCart);


// ✅ FIXED MISSING ROUTES ⬇⬇⬇
router.patch("/cart", updateCartItem);
router.delete("/cart/:productId", removeFromCart);
router.delete("/cart", clearCart);
// ✅ ORDERS
router.post("/checkout", checkout);
router.get("/orders", getMyOrders);
router.get("/orders/:orderId", getOrderDetails);
router.patch("/orders/:orderId/cancel", cancelOrder);
router.post("/orders/:orderId/return", returnOrder);

// ✅ WISHLIST
router.get("/wishlist", getWishlist);
router.post("/wishlist", addToWishlist);
router.delete("/wishlist/:productId", removeFromWishlist);
router.delete("/wishlist", clearWishlist);

// ✅ ADDRESSES
router.get("/addresses", getMyAddresses);
router.post("/addresses", addAddress);
router.patch("/addresses/:id", updateAddress);
router.delete("/addresses/:id", deleteAddress);

module.exports = router;
