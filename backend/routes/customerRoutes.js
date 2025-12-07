const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

const {
  getProducts,
  getProductDetails,
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  checkout,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  returnOrder
} = require('../controllers/customerController');

const {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress
} = require('../controllers/addressController');

// Test route (public)
router.get('/test', (req, res) => res.json({ ok: true }));

// Public product routes
router.get('/products', getProducts);
router.get('/products/:productId', getProductDetails);

// Protected routes (customer only)
router.use(authMiddleware, roleMiddleware('customer'));

// Cart
router.get('/cart', getCart);
router.post('/cart', addToCart);
router.patch('/cart', updateCartItem);
router.delete('/cart/:productId', removeFromCart);
router.delete('/cart', clearCart);

// Addresses
router.get('/addresses', getAddresses);
router.post('/addresses', addAddress);
router.patch('/addresses/:id', updateAddress);
router.delete('/addresses/:id', deleteAddress);

// Orders
router.post('/checkout', checkout);
router.get('/orders', getMyOrders);
router.get('/orders/:orderId', getOrderDetails);
router.patch('/orders/:orderId/cancel', cancelOrder);
router.post('/orders/:orderId/return', returnOrder);

module.exports = router;
