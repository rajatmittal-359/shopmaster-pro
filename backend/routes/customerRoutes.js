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
  cancelOrderItem,
  returnOrder,
  testShiprocketRate,
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

// Razorpay controller imports (only for authenticated routes)
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require("../controllers/razorpayController");

// Test route
router.get("/test", (req, res) => res.json({ ok: true }));

// ✅ All below routes require authenticated customer
router.use(authMiddleware, roleMiddleware("customer"));

// Cart routes
router.get("/cart", getCart);
router.post("/cart", addToCart);
router.patch("/cart", updateCartItem);
router.delete("/cart/:productId", removeFromCart);
router.delete("/cart", clearCart);

// PAYMENT ROUTES

// COD checkout (existing flow)
router.post("/checkout-cod", checkout);

// Online payment – create Razorpay order
router.post("/checkout-online", createRazorpayOrder);

// Online payment – verify Razorpay payment
router.post("/verify-payment", verifyRazorpayPayment);

// Orders
router.get("/orders", getMyOrders);
router.get("/orders/:orderId", getOrderDetails);
router.post("/orders/:orderId/return", returnOrder);
router.patch("/orders/:orderId/cancel", cancelOrder);
router.patch("/orders/:orderId/items/:itemId/cancel", cancelOrderItem);

// Wishlist
router.get("/wishlist", getWishlist);
router.post("/wishlist", addToWishlist);
router.delete("/wishlist/:productId", removeFromWishlist);
router.delete("/wishlist", clearWishlist);

// Addresses
router.get("/addresses", getMyAddresses);
router.post("/addresses", addAddress);
router.patch("/addresses/:id", updateAddress);
router.delete("/addresses/:id", deleteAddress);



// Shiprocket test route - TEMP
router.get(
  '/test-shiprocket',
  authMiddleware,
  roleMiddleware('customer'),
  testShiprocketRate
);

module.exports = router;
