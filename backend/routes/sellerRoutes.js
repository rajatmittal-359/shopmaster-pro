const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

const {
  getSellerProfile,
  getMyProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  getLowStockProducts,
  getMyOrders,
  updateOrderStatus,
  getSellerAnalytics
} = require('../controllers/sellerController');

// ✅ All routes require seller authentication
router.use(authMiddleware, roleMiddleware('seller'));

// ==================== PROFILE ====================
router.get('/profile', getSellerProfile);

// ==================== PRODUCTS ====================
router.get('/products', getMyProducts);
router.post('/products', addProduct);
router.patch('/products/:productId', updateProduct);
router.delete('/products/:productId', deleteProduct);
router.patch('/products/:productId/stock', updateStock);
router.get('/products/low-stock', getLowStockProducts);

// ==================== ORDERS ====================
router.get('/orders', getMyOrders);

// ✅ Only ONE status update API (future proof for Stripe also)
router.patch('/orders/:orderId/status', updateOrderStatus);

// ==================== ANALYTICS ====================
router.get('/analytics', getSellerAnalytics);

module.exports = router;
