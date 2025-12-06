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

// All routes require seller authentication
router.use(authMiddleware, roleMiddleware('seller'));

// Profile
router.get('/profile', getSellerProfile);

// Products
router.get('/products', getMyProducts);
router.post('/products', addProduct);
router.patch('/products/:productId', updateProduct);
router.delete('/products/:productId', deleteProduct);
router.patch('/products/:productId/stock', updateStock);
router.get('/products/low-stock', getLowStockProducts);

// Orders
router.get('/orders', getMyOrders);
router.patch('/orders/:orderId/status', updateOrderStatus);

// Analytics
router.get('/analytics', getSellerAnalytics);

module.exports = router;
