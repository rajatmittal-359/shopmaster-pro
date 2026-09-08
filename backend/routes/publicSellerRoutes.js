/**
 * A seller, as a shopper is allowed to see them.
 *
 * WHY A SELLER NEEDS A PAGE AT ALL
 *   On a marketplace the shopper is not buying from us - they are buying from
 *   somebody they have never heard of, whose name we print on a product page
 *   and nothing more. Etsy and eBay both make the seller a PLACE: a rating, a
 *   date they started, and everything else they sell. That is where trust
 *   accumulates on a marketplace, and without it every product starts from
 *   zero.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   The commission rate, the payout details, the GSTIN, the email, the phone,
 *   the pickup address, and whether the platform owns this shop. Every one of
 *   those is either the seller's private business or ours. The endpoint builds
 *   its answer field by field for exactly that reason - a `.lean()` of the
 *   whole document would leak all of it the first time somebody added a field.
 */
const express = require('express');

const router = express.Router();

const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Category = require('../models/Category');

/**
 * GET /api/public/sellers/:userId
 *
 * Keyed on the USER id, because that is what a product carries and what the
 * product page already exposes.
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const seller = await Seller.findOne({ userId })
      .select('businessName isApproved status createdAt')
      .lean();

    /*
     * A shop that was never approved, or has been suspended, is not a page.
     * Answering 404 rather than an empty profile keeps it out of Google, and
     * a suspended seller's products are already hidden from the catalogue.
     */
    if (!seller || !seller.isApproved || seller.status === 'suspended') {
      return res.status(404).json({ message: 'No such shop' });
    }

    // Only what a shopper could reach anyway: live, in stock, browsable.
    const browsable = await Category.getBrowsableIds();
    const filter = {
      sellerId: userId,
      isActive: true,
      isDeleted: { $ne: true },
      stock: { $gt: 0 },
      category: { $in: browsable },
    };

    const [products, count, rating] = await Promise.all([
      Product.find(filter)
        .select('name slug price salePrice saleStartsAt saleEndsAt mrp images avgRating totalReviews')
        .sort({ createdAt: -1 })
        .limit(24)
        .lean(),
      Product.countDocuments(filter),
      /*
       * One rating for the shop, weighted by how many reviews each product
       * has. A plain average of averages lets a single five-star review on one
       * product outweigh fifty reviews at 4.2 on another - which is how a
       * shop with one happy customer outranks one with fifty.
       */
      Product.aggregate([
        { $match: { sellerId: require('mongoose').Types.ObjectId.createFromHexString(String(userId)) } },
        { $match: { totalReviews: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            weighted: { $sum: { $multiply: ['$avgRating', '$totalReviews'] } },
            reviews: { $sum: '$totalReviews' },
          },
        },
      ]),
    ]);

    const totals = rating[0];

    return res.json({
      seller: {
        id: userId,
        businessName: seller.businessName,
        sellingSince: seller.createdAt,
        productCount: count,
        rating: totals?.reviews
          ? {
              average: Math.round((totals.weighted / totals.reviews) * 10) / 10,
              reviews: totals.reviews,
            }
          : null,
      },
      products,
    });
  } catch (error) {
    console.error('PUBLIC SELLER ERROR:', error.message);
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
