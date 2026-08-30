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

// Analytics
router.get('/analytics', getAnalytics);

// Seller settlements. What is owed, and recording that it was transferred.
router.get('/payouts/payable', getPayableSellers);
router.get('/payouts', listPayouts);
router.post('/payouts', createPayout);
router.patch('/payouts/:payoutId/paid', settlePayout);
router.patch('/payouts/:payoutId/failed', failPayout);

module.exports = router;
