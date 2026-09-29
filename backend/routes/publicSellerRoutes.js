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
const { availabilityOf } = require('../utils/availability');

const router = express.Router();

const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Category = require('../models/Category');

/**
 * GET /api/public/sellers/:handle
 *
 * The handle is the USER id - what a product carries and what the product
 * page already exposes - or the shop's SLUG, which is what the short link
 * www.shopmasterpro.in/charming-jewels resolves with (27 Sep 2026).
 *
 * The id is tried first and only when the handle actually looks like one, so
 * a slug can never cost a wasted ObjectId cast, and a 24-character hex shop
 * name could never shadow a real id.
 */
router.get('/:handle', async (req, res) => {
  try {
    const handle = String(req.params.handle || '');
    const byId = /^[0-9a-f]{24}$/i.test(handle);

    const FIELDS =
      'userId slug whatsapp businessName isApproved status createdAt about links showLocation pickupAddress aboutModeration vacation application.legalName application.gstin application.gstMode application.enrolmentNumber gstNumber';

    const seller = await Seller.findOne(byId ? { userId: handle } : { slug: handle.toLowerCase() })
      .select(FIELDS)
      .lean();

    // Everything below keys off the user id, whichever way the shop was found.
    const userId = seller ? String(seller.userId) : handle;

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

    // On a break (utils/vacation): the count stays (the shop is not empty), the grid does not.
    const shopBreak = require('../utils/vacation').breakOf(seller);
    const [products, count, rating] = await Promise.all([
      shopBreak ? [] : Product.find(filter)
        // `stock` and `reserved` are what ProductCard reads to decide between
        // the buy buttons and "Out of stock" - without them every card on a
        // shop page reads 0 and says the shop has nothing. The product page
        // already prints "2 left", so neither number is new in public.
        .select('name slug price salePrice saleStartsAt saleEndsAt mrp images avgRating totalReviews stock reserved')
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
        // The short link, when the shop has one. The page makes it the
        // canonical URL so Google indexes the pretty address, not the id.
        slug: seller.slug || null,
        /*
         * Digits only, and only if the seller typed them into Settings
         * knowing they would be published. This is NOT pickupAddress.phone -
         * that is a courier contact and stays off this endpoint.
         */
        whatsapp: seller.whatsapp || '',
        businessName: seller.businessName,
        sellingSince: seller.createdAt,
        about: seller.aboutModeration?.status === 'held' || seller.aboutModeration?.status === 'removed' ? '' : seller.about || '',
        links: Object.fromEntries(Object.entries(seller.links || {}).filter(([, v]) => v)),
        city: seller.showLocation && seller.pickupAddress?.city ? { city: seller.pickupAddress.city, state: seller.pickupAddress.state || '' } : null,
        /*
         * The seller-of-record line the Consumer Protection (E-Commerce) Rules
         * 2020 ask a marketplace to show: legal name and GST standing (plan
         * 2.40). The PAN is not shown - a GSTIN already carries it, and a bare
         * PAN on a public page is an identity-theft gift.
         */
        legal: {
          name: seller.application?.legalName || seller.businessName,
          // Rule 6(5)(a)-(b): the seller's geographic address, on the platform.
          address: [seller.pickupAddress?.address1, [seller.pickupAddress?.city, seller.pickupAddress?.state, seller.pickupAddress?.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          /*
           * The SAME address, unjoined (29 Sep 2026).
           *
           * Nothing new is exposed - these are the four parts that the line
           * above already prints. They are sent apart because the shop page
           * puts them into schema.org PostalAddress, and a single joined
           * string is the one shape structured data cannot use: Google
           * matches a website to a Business Profile on street, locality and
           * postcode as separate fields, and a shop whose site and Profile
           * agree on all three is the entity match the whole local result
           * rests on. Parsing the joined string back apart with a regex was
           * the alternative, and it would break on the first address with a
           * comma in its street line - which is most of them.
           */
          postal: {
            street: seller.pickupAddress?.address1 || '',
            locality: seller.pickupAddress?.city || '',
            region: seller.pickupAddress?.state || '',
            postalCode: seller.pickupAddress?.pincode || '',
          },
          gstin: seller.application?.gstin || seller.gstNumber || '',
          enrolled: !seller.application?.gstin && !seller.gstNumber && seller.application?.gstMode === 'enrolment' ? (require('../utils/kyc').checkEnrolment(seller.application.enrolmentNumber).state || 'their state') : '',
        },
        // On a break (utils/vacation): the page stays, the products are hidden, this says when.
        break: shopBreak,
        productCount: count,
        rating: totals?.reviews
          ? {
              average: Math.round((totals.weighted / totals.reviews) * 10) / 10,
              reviews: totals.reviews,
            }
          : null,
      },
      /*
       * The ANSWER, not the raw inputs (utils/availability). Every card
       * used to subtract `stock - reserved` itself, in five different
       * components, and a query that forgot either field turned a shop
       * full of stock into a shop that said "Out of stock". The two raw
       * numbers still travel: the seller's own panel prints how many are
       * held in checkouts, which is real work, not a display detail.
       */
      products: products.map((product) => ({ ...product, availability: availabilityOf(product) })),
    });
  } catch (error) {
    console.error('PUBLIC SELLER ERROR:', error.message);
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
