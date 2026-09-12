// backend/controllers/reviewController.js
const mongoose = require('mongoose');
const { sendError } = require('../utils/apiError');
const Review = require('../models/Review');
const Product = require('../models/Product');

/**
 * Resolve the :productId route param, which may be the SEO slug or the raw
 * ObjectId.
 *
 * THE BUG THIS FIXES
 *   Product URLs are canonical on the slug - /products/kundan-chandbali-
 *   earrings-6d5643 - and that is what the sitemap lists and what Google sends
 *   people to. The product endpoint already accepted either form, but these
 *   handlers passed the raw param straight into a query on _id. Mongoose could
 *   not cast a slug to an ObjectId, so reading reviews returned 400 and posting
 *   one failed outright: on every product page reached from search, the reviews
 *   simply were not there. The verified-buyer check compared an order line's
 *   ObjectId against the slug too, so it could never have matched anyway.
 *
 * Returns the product document, or null.
 */
const { deliveredOrderWith } = require('../utils/reviewEligibility');

const findProduct = (productId, extra = {}) => {
  const identity = mongoose.isValidObjectId(productId)
    ? { $or: [{ slug: productId }, { _id: productId }] }
    : { slug: productId };

  return Product.findOne({ ...identity, ...extra });
};

// ✅ PUBLIC: Get reviews for a product
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;

    // Reviews are stored against the product's _id, so a slug has to be
    // resolved first rather than queried with.
    const product = await findProduct(productId).select('_id').lean();
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const reviews = await Review.find({ productId: product._id })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    res.json({
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    sendError(res, error);
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
    const product = await findProduct(productId, {
      isActive: true,
      stock: { $gt: 0 },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found or inactive' });
    }

        /*
     * Only somebody who actually received this product may review it.
     *
     * THE BUG THIS REPLACES
     *   The query used to be `Order.findOne({ customerId, status })` - ONE
     *   arbitrary delivered order belonging to this customer - and then looked
     *   for the product inside it. A customer with more than one delivered
     *   order was refused whenever Mongo happened to return a different one:
     *   "You can only review products you have successfully received", said to
     *   somebody holding the product. It got worse the more they bought, which
     *   is exactly backwards.
     *
     *   The product is now part of the QUERY, so it finds the order that
     *   actually contains it, whichever one that is.
     *
     * `items.status: 'active'` keeps out cancelled lines, and `$elemMatch`
     * makes both conditions apply to the SAME item - without it an order
     * containing this product AND some other active item would pass.
     */
    const order = await deliveredOrderWith(req.user._id, product._id);

    if (!order) {
      return res.status(400).json({
        message: 'You can only review products you have successfully received',
      });
    }

    // ✅ Create / Update single review per product
    let review = await Review.findOne({
      productId: product._id,
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
        productId: product._id,
        userId: req.user._id,
        orderId: order._id,
        rating,
        title,
        comment,
      });
    }

    // ✅ Recalculate product rating
    await Review.recalculateProductRating(product._id);

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
    sendError(res, error);
  }
};

/**
 * Whether the product page may offer THIS customer the review form, and the
 * review they already wrote if any.
 *
 * The server decides, the page draws: without this, the page would either
 * show a form to everybody (and refuse most of them at the last step) or
 * guess from the orders list. Same lookup as creating a review, on purpose.
 */
exports.myReviewStatus = async (req, res) => {
  try {
    const product = await findProduct(req.params.productId).select('_id').lean();
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const [order, review] = await Promise.all([
      deliveredOrderWith(req.user._id, product._id),
      Review.findOne({ productId: product._id, userId: req.user._id }).lean(),
    ]);

    res.json({
      canReview: Boolean(order),
      reason: order ? null : 'not_received',
      review: review || null,
    });
  } catch (error) {
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
  }
};
