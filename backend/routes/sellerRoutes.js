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
  getOrderDetails,
  updateOrderStatus,
  getSellerAnalytics,
  updateTracking
} = require('../controllers/sellerController');

const checkSellerStatus = require('../middlewares/checkSellerStatus');
const { requireApprovedSeller } = require('../middlewares/checkSellerStatus');
router.use(authMiddleware, roleMiddleware('seller'), checkSellerStatus);

// Read-only routes stay available to an unapproved seller so they can still see
// their own dashboard and the "account under review" state.
router.get('/profile', getSellerProfile);


router.get('/products', getMyProducts);
router.get('/products/low-stock', getLowStockProducts);
router.get('/products/:id', getProductById);

router.get('/orders', getMyOrders);
router.get('/orders/:orderId', getOrderDetails);

router.get('/analytics', getSellerAnalytics);

// Capabilities that admin approval is meant to unlock: listing/altering catalogue
// and fulfilling orders. Previously these were reachable by any non-suspended
// seller, which made approve/reject purely cosmetic.
router.post('/products', requireApprovedSeller, addProduct);
router.patch('/products/:productId', requireApprovedSeller, updateProduct);
router.delete('/products/:productId', requireApprovedSeller, deleteProduct);
router.patch('/products/:productId/stock', requireApprovedSeller, updateStock);

router.patch('/orders/:orderId/status', requireApprovedSeller, updateOrderStatus);
router.patch('/orders/:orderId/tracking', requireApprovedSeller, updateTracking);

// A seller's own earnings, settlement history and the account they are paid into.
const {
  getMyEarnings,
  getMyPayoutDetails,
  updateMyPayoutDetails,
} = require('../controllers/payoutController');

router.get('/earnings', getMyEarnings);
router.get('/payout-details', getMyPayoutDetails);
router.patch('/payout-details', updateMyPayoutDetails);

module.exports = router;