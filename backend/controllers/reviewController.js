// backend/controllers/reviewController.js
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');

// ✅ PUBLIC: Get reviews for a product
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;

    const reviews = await Review.find({ productId })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    res.json({
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ CUSTOMER: Create or update review for a product
exports.createOrUpdateReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, title, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ message: 'Rating is required (1 to 5)' });
    }

    // Check product exists & active
    const product = await Product.findOne({
      _id: productId,
      isActive: true,
      stock: { $gt: 0 },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found or inactive' });
    }

    // ✅ Verified buyer check (delivered OR returned)
const order = await Order.findOne({
  customerId: req.user._id,
  status: { $in: ['delivered', 'returned'] },
});

// ✅ Verify specific item was delivered & not cancelled
const purchasedItem = order?.items.find(
  (item) =>
    item.productId.toString() === productId &&
    item.status === 'active' // Only active items (not cancelled)
);

if (!purchasedItem) {
  return res.status(400).json({
    message: 'You can only review products you have successfully received',
  });
}

    // ✅ Create / Update single review per product
    let review = await Review.findOne({
      productId,
      userId: req.user._id,
    });

    if (review) {
      // Update
      review.rating = rating;
      if (title !== undefined) review.title = title;
      if (comment !== undefined) review.comment = comment;

      await review.save();
    } else {
      // Create
      review = await Review.create({
        productId,
        userId: req.user._id,
        orderId: order._id,
        rating,
        title,
        comment,
      });
    }

    // ✅ Recalculate product rating
    await Review.recalculateProductRating(productId);

    res.status(201).json({
      message: 'Review saved successfully',
      review,
    });
  } catch (error) {
    // Handle unique index error (1 review per product/user)
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: 'You have already reviewed this product' });
    }
    res.status(500).json({ message: error.message });
  }
};

// ✅ CUSTOMER: Delete own review
exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findOne({
      _id: reviewId,
      userId: req.user._id,
    });

    if (!review) {
      return res
        .status(404)
        .json({ message: 'Review not found or not yours' });
    }

    const productId = review.productId;

    await review.deleteOne();

    // Recalculate product rating after delete
    await Review.recalculateProductRating(productId);

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ CUSTOMER: Get my reviews
exports.getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.user._id })
      .populate('productId', 'name images price')
      .sort({ createdAt: -1 });

    res.json({
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
