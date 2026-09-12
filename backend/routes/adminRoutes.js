const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const {
  getAllSellers,
  approveSeller,
  rejectSeller,
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getAnalytics,
  suspendSeller,
  activateSeller,
  getAllOrders,
  getOrderById
} = require('../controllers/adminController');

const {
  getPayableSellers,
  createPayout,
  listPayouts,
  settlePayout,
  failPayout,
} = require('../controllers/payoutController');

// All routes require admin role
router.use(authMiddleware, roleMiddleware('admin'));

// Seller management
// NOTE: the path says "pending" but this returns EVERY seller, whatever their
// approval state. The frontend depends on the path, so it is left as-is rather
// than renamed; the handler name is the accurate one.
router.get('/sellers/pending', getAllSellers);
router.patch('/sellers/:sellerId/approve', approveSeller);
router.patch('/sellers/:sellerId/reject', rejectSeller);
router.patch('/sellers/:sellerId/suspend', suspendSeller);
router.patch('/sellers/:sellerId/activate', activateSeller);

// Category management
router.post('/categories', createCategory);
router.get('/categories', getCategories);
router.patch('/categories/:categoryId', updateCategory);
router.delete('/categories/:categoryId', deleteCategory);

// Order operations (read-only platform visibility)
router.get('/orders', getAllOrders);
router.get('/orders/:orderId', getOrderById);

// The platform stepping in. See cancelOrderAsAdmin - the admin could read
// orders and do nothing about them.
router.post('/orders/:orderId/cancel', require('../controllers/adminController').cancelOrderAsAdmin);

// The referee. Somebody has to be able to decide when a customer and a seller
// disagree about what happened, and to be seen to have decided.
router.post(
  '/orders/:orderId/dispute/resolve',
  require('../controllers/adminController').resolveDispute
);

// What the platform charges one seller. Rates are snapshotted onto orders when
// they are placed, so this only ever changes what happens from here on.
router.patch(
  '/sellers/:sellerId/commission',
  require('../controllers/adminController').setSellerCommission
);

// Coupons. An admin may create either kind; a seller may only fund their own.
const adminCtrl = require('../controllers/adminController');
router.get('/coupons', adminCtrl.listCoupons);
router.post('/coupons', adminCtrl.createCoupon);
router.patch('/coupons/:couponId/toggle', adminCtrl.toggleCoupon);

// Analytics
router.get('/analytics', getAnalytics);

// Seller settlements. What is owed, and recording that it was transferred.
router.get('/payouts/payable', getPayableSellers);
router.get('/payouts', listPayouts);
router.post('/payouts', createPayout);
router.patch('/payouts/:payoutId/paid', settlePayout);
router.patch('/payouts/:payoutId/failed', failPayout);

// Today's AI spend across the platform, and who used it. Read-only.
const ai = require('../controllers/aiController');
router.get('/ai/usage', ai.adminUsage);
router.get('/ai/catalog', ai.getCatalog);
router.patch('/ai/limits', ai.setLimits);
router.post('/ai/listing', ai.writeListing);
router.post('/ai/refine', ai.refineText);
// Banners and category art from words - the one image mode sellers do not get.
router.post('/ai/image', ai.makeImage);
router.post('/ai/attach', ai.attachToProduct);
router.get('/ai/drafts', ai.listDrafts);

module.exports = router;
