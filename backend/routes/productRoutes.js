// backend/routes/productRoutes.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { buildCatalogueFilter } = require('../utils/catalogueFilter');
const Product = require('../models/Product');
const Category = require('../models/Category');

/**
 * ✅ GET all active categories (PUBLIC)
 *  URL: /api/public/products/categories/all
 *  Note: Isko sabse upar rakha hai, taaki /:productId se clash na ho.
 */
// Get all categories - PUBLIC (FLAT LIST - backward compatible)
router.get('/categories/all', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .populate('parentCategory', 'name')  // ✅ Parent info add
      .select('name description parentCategory')
      
    
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Get category hierarchy tree - PUBLIC
router.get('/categories/tree', async (req, res) => {
  try {
    // Only browsable categories: active, and with no deactivated ancestor.
    const browsableIds = await Category.getBrowsableIds();

    const allCategories = await Category.find({ _id: { $in: browsableIds } })
      .select('name slug description parentCategory ancestors')
      .sort({ name: 1 })
      .lean();

    // Live product count per leaf category, rolled up to every ancestor so a
    // parent reports everything beneath it.
    const counts = await Product.aggregate([
      { $match: { isActive: true, stock: { $gt: 0 }, category: { $in: browsableIds } } },
      { $group: { _id: '$category', n: { $sum: 1 } } },
    ]);
    const directCount = new Map(counts.map((c) => [String(c._id), c.n]));

    const categoryMap = {};
    const roots = [];

    allCategories.forEach((cat) => {
      categoryMap[String(cat._id)] = {
        _id: cat._id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        parentCategory: cat.parentCategory || null,
        productCount: directCount.get(String(cat._id)) || 0,
        children: [],
      };
    });

    // Roll each leaf's count up through its ancestors.
    allCategories.forEach((cat) => {
      const n = directCount.get(String(cat._id)) || 0;
      if (!n) return;
      (cat.ancestors || []).forEach((a) => {
        const node = categoryMap[String(a)];
        if (node) node.productCount += n;
      });
    });

    allCategories.forEach((cat) => {
      const node = categoryMap[String(cat._id)];
      const parent = cat.parentCategory && categoryMap[String(cat.parentCategory)];
      if (parent) parent.children.push(node);
      else roots.push(node);
    });

    res.json({
      categories: roots,
      totalCategories: allCategories.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



/**
 * ✅ GET products list (PUBLIC)
 *  URL: /api/public/products
 *  Query:
 *    - category
 *    - search
 *    - minPrice
 *    - maxPrice
 *    - page (default 1)
 *    - limit (default 20)
 */
/**
 * The orders a shopper may put the catalogue in.
 *
 * A WHITELIST, NOT A PASS-THROUGH. `?sort=` arrives from the URL bar, and
 * handing user input straight to Mongoose lets a stranger sort by any field in
 * the document - including ones we never meant to expose the shape of - and
 * lets an object like `{"$where": ...}` in through a query string. Five named
 * orders is all a jewellery shop needs; anything else falls back to newest.
 *
 * EVERY ONE ENDS IN `_id`. Without a tiebreaker, two products at the same price
 * have no defined order between them, and Mongo is free to return them
 * differently on each query - so page 2 can repeat an item page 1 already
 * showed, and skip one entirely. The bug looks like "a product disappeared".
 */
const SORTS = {
  newest: { createdAt: -1, _id: 1 },
  'price-asc': { price: 1, _id: 1 },
  'price-desc': { price: -1, _id: 1 },
  // Rated highest first, but a single five-star review must not outrank a
  // piece with fifty at 4.6 - so the count breaks the tie, not the id.
  rating: { avgRating: -1, totalReviews: -1, _id: 1 },
  popular: { totalReviews: -1, avgRating: -1, _id: 1 },
};

router.get('/', async (req, res) => {
  try {
    const {
      category,
      search,
      minPrice,
      maxPrice,
      color,
      minRating,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const built = await buildCatalogueFilter({
      category, search, minPrice, maxPrice, color, minRating,
    });

    // A category that does not exist is a 404, not an empty result page.
    // Answering 200 with zero products creates a "soft 404": Google indexes the
    // empty page as real content, and its JS SEO guidance calls this out.
    if (built.notFound) return res.status(404).json({ message: 'Category not found' });
    if (built.empty) {
      return res.json({ products: [], totalPages: 0, currentPage: 1, total: 0 });
    }

    const { filter } = built;

    const numericLimit = Number(limit) || 20;
    const numericPage = Number(page) || 1;

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('sellerId', 'name')
      .sort(SORTS[sort] || SORTS.newest)
      .limit(numericLimit)
      .skip((numericPage - 1) * numericLimit);

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      totalPages: Math.ceil(total / numericLimit),
      currentPage: numericPage,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * ✅ GET the filter panel's own data (PUBLIC)
 *  URL: /api/public/products/filters
 *
 * WHY THIS EXISTS RATHER THAN A HARD-CODED LIST
 *   A sidebar offering "Emerald Green" when nothing green is in stock is worse
 *   than offering nothing: the shopper clicks it and lands on an empty grid,
 *   which Baymard finds is where nearly half of sites leave people stranded.
 *   These are the colours and the price range that genuinely exist inside the
 *   current category and search.
 *
 * WHY COLOURS IGNORE THE SELECTED COLOUR
 *   Counted with every filter EXCEPT colour. Applying it first would leave the
 *   panel showing one colour - the one already chosen - and no way back to the
 *   others without clearing everything.
 */
router.get('/filters', async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, minRating } = req.query;

    const forColours = await buildCatalogueFilter({
      category, search, minPrice, maxPrice, minRating,
    });
    if (forColours.notFound) return res.status(404).json({ message: 'Category not found' });
    if (forColours.empty) return res.json({ colors: [], price: null });

    // The price slider's ends come from the category and search alone. Deriving
    // them from the current price filter would shrink the slider each time it
    // was moved, and there would be no way to widen it again.
    const forPrices = await buildCatalogueFilter({ category, search });

    const [colors, priceRange] = await Promise.all([
      Product.aggregate([
        { $match: forColours.filter },
        { $match: { color: { $nin: [null, ''] } } },
        { $group: { _id: '$color', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      Product.aggregate([
        { $match: forPrices.filter },
        { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
      ]),
    ]);

    res.json({
      colors: colors.map((c) => ({ value: c._id, count: c.count })),
      price: priceRange[0]
        ? { min: Math.floor(priceRange[0].min), max: Math.ceil(priceRange[0].max) }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * ✅ GET single product details (PUBLIC)
 *  URL: /api/public/products/:productId
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    // Accept either the SEO slug or the raw ObjectId, so links shared before
    // slugs existed keep working. Slug is tried first: it is the canonical form.
    const product = await Product.findOne(
      mongoose.isValidObjectId(productId)
        ? { $or: [{ slug: productId }, { _id: productId }] }
        : { slug: productId }
    )
      .populate('category', 'name slug description ancestors')
      .populate('sellerId', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
