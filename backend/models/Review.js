    // backend/models/Review.js
    const mongoose = require('mongoose');
    const Product = require('./Product');

    const reviewSchema = new mongoose.Schema(
    {
        productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true,
        },
        userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
        },
        orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        },
        rating: {
        type: Number,
        required: true,
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5'],
        },
        title: {
        type: String,
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters'],
        },
        comment: {
        type: String,
        trim: true,
        maxlength: [1000, 'Comment cannot exceed 1000 characters'],
        },
    },
    { timestamps: true }
    );

    // ✅ 1 user = 1 review per product
    reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

    // ✅ Helper to recalc product avg rating
    reviewSchema.statics.recalculateProductRating = async function (productId) {
    const stats = await this.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(productId) } },
        {
        $group: {
            _id: '$productId',
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
        },
        },
    ]);

    if (stats.length > 0) {
        await Product.findByIdAndUpdate(productId, {
        avgRating: stats[0].avgRating,
        totalReviews: stats[0].totalReviews,
        });
    } else {
        // No reviews => reset
        await Product.findByIdAndUpdate(productId, {
        avgRating: 0,
        totalReviews: 0,
        });
    }
    };

    const Review = mongoose.model('Review', reviewSchema);

    module.exports = Review;
