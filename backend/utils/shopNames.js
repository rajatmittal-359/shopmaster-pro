const Seller = require('../models/Seller');

/**
 * Which SHOP a product belongs to, by name.
 *
 * `Product.sellerId` points at the seller's User, and the public routes used
 * to populate its `name` - so every product page said "Sold by Rajat Mittal",
 * a person, while that seller's own page says "Charming Jewels". Etsy and
 * Amazon name the shop, never the owner; and naming the owner on every
 * product also tells the world which shop the platform's operator runs, which
 * the plan says never to reveal.
 *
 * One query for a whole page of products, then a stamp on each - the
 * document itself is left as it was, because the feed and the old app read it.
 */
const shopNamesFor = async (userIds) => {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const sellers = await Seller.find({ userId: { $in: ids } }).select('userId businessName').lean();
  return new Map(sellers.map((s) => [String(s.userId), s.businessName || null]));
};

const sellerIdOf = (product) =>
  product?.sellerId && typeof product.sellerId === 'object' ? product.sellerId._id : product?.sellerId;

/** @returns plain objects, each with `shop: { id, name }` */
const withShop = async (products) => {
  const names = await shopNamesFor(products.map(sellerIdOf));
  return products.map((p) => {
    const plain = typeof p.toObject === 'function' ? p.toObject() : { ...p };
    const id = sellerIdOf(p);
    return { ...plain, shop: { id: id ? String(id) : null, name: id ? names.get(String(id)) ?? null : null } };
  });
};

module.exports = { shopNamesFor, withShop };
