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

// Book the courier the customer paid for, once the parcel is packed. Nothing
// reaches a courier before this is pressed.
const { shipOrder, cancelShipment, cancelOwnLines } = require('../controllers/sellerController');
router.post('/orders/:orderId/ship', requireApprovedSeller, shipOrder);
router.post('/orders/:orderId/ship/cancel', requireApprovedSeller, cancelShipment);

// Calling off the ORDER, not just the courier. See cancelOwnLines.
router.post('/orders/:orderId/cancel', requireApprovedSeller, cancelOwnLines);

// Closing out a return. Receiving the goods back is what pays the refund;
// refusing needs a reason the customer can dispute.
router.post(
  '/orders/:orderId/return',
  requireApprovedSeller,
  require('../controllers/sellerController').settleReturn
);

/*
 * The AI a seller can reach. Approved sellers only - these spend a free
 * allowance that belongs to the whole platform, and an unapproved account has
 * no products to improve yet.
 */
const ai = require('../controllers/aiController');
router.get('/ai/usage', requireApprovedSeller, ai.getUsage);
router.get('/ai/catalog', requireApprovedSeller, ai.getCatalog);
router.patch('/ai/limits', requireApprovedSeller, ai.setLimits);
router.post('/ai/listing', requireApprovedSeller, ai.writeListing);
router.post('/ai/image', requireApprovedSeller, ai.makeImage);
router.post('/ai/attach', requireApprovedSeller, ai.attachToProduct);
router.get('/ai/drafts', requireApprovedSeller, ai.listDrafts);

// A seller's own shop settings: whether they absorb delivery, and the address a
// courier collects from.
const sellerCtrl = require('../controllers/sellerController');
router.get('/settings', sellerCtrl.getSettings);
router.post('/agreement/accept', sellerCtrl.acceptAgreement);
router.patch('/settings', sellerCtrl.updateSettings);

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