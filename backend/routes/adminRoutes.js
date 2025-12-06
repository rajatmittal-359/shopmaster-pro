const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const {
  getPendingSellers,
  approveSeller,
  rejectSeller,
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getAnalytics
} = require('../controllers/adminController');
const Category = require('../models/Category');
// All routes require admin role
router.use(authMiddleware, roleMiddleware('admin'));

// Seller management
router.get('/sellers/pending', getPendingSellers);
router.patch('/sellers/:sellerId/approve', approveSeller);
router.patch('/sellers/:sellerId/reject', rejectSeller);

// Category management
router.post('/categories', createCategory);
router.get('/categories', getCategories);
router.patch('/categories/:categoryId', updateCategory);
router.delete('/categories/:categoryId', deleteCategory);

// Analytics
router.get('/analytics', getAnalytics);

module.exports = router;
