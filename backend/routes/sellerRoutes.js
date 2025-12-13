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
  getProductById,
  updateStock,
  getLowStockProducts,
  getMyOrders,
  updateOrderStatus,
  getSellerAnalytics,
  updateTracking
} = require('../controllers/sellerController');

const checkSellerStatus = require('../middlewares/checkSellerStatus');
router.use(authMiddleware, roleMiddleware('seller'), checkSellerStatus);


router.get('/profile', getSellerProfile);


router.get('/products', getMyProducts);
router.post('/products', addProduct);
router.patch('/products/:productId', updateProduct);
router.delete('/products/:productId', deleteProduct);
router.patch('/products/:productId/stock', updateStock);
router.get('/products/low-stock', getLowStockProducts);
router.get('/products/:id', getProductById);

router.get('/orders', getMyOrders);

router.patch('/orders/:orderId/status', updateOrderStatus);
router.patch(
  '/orders/:orderId/tracking',
  authMiddleware,
  roleMiddleware('seller'),
  updateTracking
);

router.get('/analytics', getSellerAnalytics);

module.exports = router;
