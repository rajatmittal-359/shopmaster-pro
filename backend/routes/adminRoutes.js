const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const {
  getAllSellers,        // ✅ CHANGED: getPendingSellers → getAllSellers
  approveSeller,
  rejectSeller,
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getAnalytics,
  suspendSeller,
  activateSeller
} = require('../controllers/adminController');

// All routes require admin role
router.use(authMiddleware, roleMiddleware('admin'));

// Seller management
router.get('/sellers/pending', getAllSellers);  // ✅ CHANGED: function name
router.patch('/sellers/:sellerId/approve', approveSeller);
router.patch('/sellers/:sellerId/reject', rejectSeller);
router.patch('/sellers/:sellerId/suspend', suspendSeller);
router.patch('/sellers/:sellerId/activate', activateSeller);

// Category management
router.post('/categories', createCategory);
router.get('/categories', getCategories);
router.patch('/categories/:categoryId', updateCategory);
router.delete('/categories/:categoryId', deleteCategory);

// Analytics
router.get('/analytics', getAnalytics);

module.exports = router;
