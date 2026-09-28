const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { viewsFor } = require('../utils/productViews');
const { sendError } = require('../utils/apiError');

/**
 * What one listing has actually earned - the half of a product's story the
 * edit form cannot tell (27 Sep 2026, Rajat: "ek about page ho seller ke paas
 * bhi product ka, jisme bare hue product ki report").
 *
 * WHY A PAGE PER PRODUCT AT ALL
 *   Etsy is the reference: their sellers open a listing and get its own Stats
 *   - views, favourites, orders, revenue, and where the traffic came from.
 *   eBay attaches prompts to the listings table instead; Amazon gives per-ASIN
 *   ROWS inside account-level dashboards and no page, because at millions of
 *   ASINs a page each is useless; Shopify keeps product analytics in Reports,
 *   away from the product. So a page per product is a SMALL-marketplace move -
 *   cheap for us, impossible for Amazon. We have three sellers.
 *
 * HONEST ABOUT WHAT IS COUNTED
 *   Cancelled items are excluded, because a seller reading "12 sold" and
 *   finding 3 were cancelled trusts nothing on the page afterwards. Revenue is
 *   the price the customer paid at the time (price x quantity), not today's
 *   price - the order is the record, not the listing.
 *
 *   Views come from models/ProductView, which counts a day at a time and
 *   skips the seller's own looks and self-declared bots. A listing older than
 *   the counter reads 0 rather than a guess, and the page says so.
 */
exports.productReport = async (req, res) => {
  try {
    const productId = new mongoose.Types.ObjectId(String(req.params.productId));
    const sellerId = req.user._id;

    // The whole listing, not a slice: the page scores it with the same
    // lib/listingScore the form uses, and draws the Google preview from the
    // name, category and description. A narrower select would have the report
    // and the form disagreeing about the score, which is worse than a few
    // extra bytes.
    const product = await Product.findOne({ _id: productId, sellerId })
      .populate('category', 'name slug')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const [sales] = await Order.aggregate([
      { $match: { 'items.productId': productId } },
      { $unwind: '$items' },
      // The seller filter repeats after the unwind: an order can carry other
      // shops' items, and one of those must never count towards this one.
      { $match: { 'items.productId': productId, 'items.sellerId': sellerId, 'items.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: null,
          units: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          orders: { $addToSet: '$_id' },
          lastSoldAt: { $max: '$createdAt' },
          firstSoldAt: { $min: '$createdAt' },
        },
      },
      { $project: { _id: 0, units: 1, revenue: 1, orders: { $size: '$orders' }, lastSoldAt: 1, firstSoldAt: 1 } },
    ]);

    const views = await viewsFor(productId, 28);

    /*
     * FAVOURITES, THE THIRD NUMBER ETSY'S PAGE IS MADE OF (28 Sep 2026)
     *
     *   A saved listing is the strongest signal short of an order: somebody
     *   meant to come back. It is also the number that explains a listing
     *   with views and no sales - saved eleven times and never bought reads
     *   as a price problem, not a photograph problem.
     *
     *   One document per shopper holds their whole list, so this is a count
     *   of PEOPLE, which is what the word means. The index on
     *   `items.productId` is what keeps it from walking every wishlist.
     */
    const favourites = await require('../models/Wishlist').countDocuments({ 'items.productId': productId });

    // No caching at all. The first version used max-age=120 and the page
    // showed 0 views while the database already held one - a report a seller
    // refreshes to watch a number move must never answer from yesterday.
    res.set('Cache-Control', 'private, no-store');
    /*
     * The shop's own name and short link travel with the report because the
     * share pack prints them onto the picture (web/src/lib/shareImage). One
     * indexed read here beats a second round trip from the panel.
     */
    const shop = await require('../models/Seller')
      .findOne({ userId: sellerId })
      .select('businessName slug')
      .lean();

    res.json({
      product,
      shop: shop ? { name: shop.businessName, path: shop.slug ? `/${shop.slug}` : `/sellers/${sellerId}` } : null,
      sales: sales || { units: 0, revenue: 0, orders: 0, lastSoldAt: null, firstSoldAt: null },
      views,
      favourites,
      // The split started on 28 Sep, a day after the counter itself. A view
      // from the 27th is in `views.total` and in no bucket, and the page
      // says which window the split covers rather than quietly dropping it.
      sourcesSince: '2026-09-28',
      // The counter started on 27 Sep 2026; anything listed before that has
      // views only from then. The page prints this rather than implying the
      // number covers the listing's whole life.
      viewsSince: '2026-09-27',
    });
  } catch (error) {
    sendError(res, error);
  }
};
