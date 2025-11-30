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
  cancelOrder
} = require('../controllers/customerController');

// Public routes (anyone can browse products)
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

// Orders
router.post('/checkout', checkout);
router.get('/orders', getMyOrders);
router.get('/orders/:orderId', getOrderDetails);
router.patch('/orders/:orderId/cancel', cancelOrder);

module.exports = router;
