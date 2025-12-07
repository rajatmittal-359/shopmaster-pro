// backend/routes/reviewRoutes.js
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

const {
  getProductReviews,
  createOrUpdateReview,
  deleteReview,
  getMyReviews,
} = require('../controllers/reviewController');

// ✅ PUBLIC: list reviews of a product
// GET /api/reviews/product/:productId
router.get('/product/:productId', getProductReviews);

// ✅ PROTECTED: customer-only routes
router.use(authMiddleware, roleMiddleware('customer'));

// POST /api/reviews/product/:productId
router.post('/product/:productId', createOrUpdateReview);

// DELETE /api/reviews/:reviewId
router.delete('/:reviewId', deleteReview);

// GET /api/reviews/me
router.get('/me', getMyReviews);

module.exports = router;
