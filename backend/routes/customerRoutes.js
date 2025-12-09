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

router.get("/test", (req, res) => res.json({ ok: true }));

router.use(authMiddleware, roleMiddleware("customer"));

router.get("/cart", getCart);
router.post("/cart", addToCart);


router.patch("/cart", updateCartItem);
router.delete("/cart/:productId", removeFromCart);
router.delete("/cart", clearCart);

router.post("/checkout", checkout);
router.get("/orders", getMyOrders);
router.get("/orders/:orderId", getOrderDetails);
router.post("/orders/:orderId/return", returnOrder);
router.patch("/orders/:orderId/cancel", cancelOrder);
router.patch('/orders/:orderId/items/:itemId/cancel', cancelOrderItem);

router.get("/wishlist", getWishlist);
router.post("/wishlist", addToWishlist);
router.delete("/wishlist/:productId", removeFromWishlist);
router.delete("/wishlist", clearWishlist);


router.get("/addresses", getMyAddresses);
router.post("/addresses", addAddress);
router.patch("/addresses/:id", updateAddress);
router.delete("/addresses/:id", deleteAddress);

module.exports = router;
