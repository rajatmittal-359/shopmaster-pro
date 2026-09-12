// backend/controllers/productController.js
/**
 * The public catalogue: categories, the product list, suggestions, filters,
 * one product.
 *
 * Moved here from routes/productRoutes.js on 12 Sep 2026 (the 5 Sep code
 * review's item 1 - 400 lines of logic living in a route file). Nothing in
 * the behaviour changed; the 923 tests that passed before the move passed
 * after it. Every handler's own WHY block travelled with it.
 */
const { withShop } = require('../utils/shopNames');
const mongoose = require('mongoose');
const { buildCatalogueFilter, escapeRegex } = require('../utils/catalogueFilter');
const Product = require('../models/Product');
const Category = require('../models/Category');

/**
 * ✅ GET all active categories (PUBLIC)
 *  URL: /api/public/products/categories/all
 *  Note: Isko sabse upar rakha hai, taaki /:productId se clash na ho.
 */
// Get all categories - PUBLIC (FLAT LIST - backward compatible)
exports.listAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .populate('parentCategory', 'name')  // ✅ Parent info add
      .select('name description parentCategory')
      
    
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Get category hierarchy tree - PUBLIC
exports.categoryTree = async (req, res) => {
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
};



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

exports.listProducts = async (req, res) => {
  try {
    const {
      category,
      search,
      minPrice,
      maxPrice,
      color,
      size,
      minRating,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const built = await buildCatalogueFilter({
      category, search, minPrice, maxPrice, color, size, minRating,
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
      // Each with its shop's name - the page says "Sold by Charming Jewels",
      // never the owner's name. One extra query for the whole page.
      products: await withShop(products),
      totalPages: Math.ceil(total / numericLimit),
      currentPage: numericPage,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ✅ GET search suggestions (PUBLIC)
 *  URL: /api/public/products/suggest?q=ring
 *
 * WHY A SEPARATE ENDPOINT AND NOT `GET /?search=&limit=6`
 *   This one fires on nearly every keystroke. The catalogue endpoint populates
 *   the seller, counts the whole result set for pagination, and returns entire
 *   product documents - description, every image, every variant field. That is
 *   a lot of database and a lot of bytes to throw away in order to draw six
 *   lines of text, and it happens six times while somebody types "earring".
 *   This returns the five fields a suggestion row actually shows.
 *
 * WHY CATEGORIES COME BACK TOO
 *   Baymard's autocomplete research is specific about this: suggestions that
 *   carry category context - "Earrings", not just five product names - let
 *   somebody jump to the whole set rather than picking one product and then
 *   hunting for its siblings. Somebody typing "ear" usually wants the category.
 *
 * WHY SIX
 *   The mobile ceiling. On a phone the list is trapped between the field above
 *   and the keyboard below, and the research puts the usable limit at five or
 *   six. There is no point computing more than can be seen.
 */
exports.suggest = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();

    // Two characters is where a prefix stops matching most of the catalogue.
    // Below that the "suggestions" are just the newest products, which teaches
    // nothing and costs a query per keystroke.
    if (q.length < 2) return res.json({ products: [], categories: [] });

    /*
     * Anchored to a WORD BOUNDARY, which the catalogue's own search is not.
     * Plain substring matching answers "ear" with "Pearl Maang Tikka" and
     * "White Pearl Necklace" - technically a match, and visibly wrong in a
     * list of six that is supposed to look like it understood the question.
     * `ear` still finds "Earrings", "Earbuds" and "Over-Ear", because a
     * hyphen counts as one too.
     *
     * Written with a real escaped backslash rather than inside a template
     * literal: in backticks, backslash-b is the BACKSPACE character, and Mongo
     * then searches for a control code that appears in no product name on
     * earth. It returned zero results and looked exactly like an empty
     * catalogue.
     */
    const rx = { $regex: '\\b' + escapeRegex(q), $options: 'i' };
    const browsable = await Category.getBrowsableIds();

    const [products, categories] = await Promise.all([
      Product.find({
        isActive: true,
        isDeleted: { $ne: true },
        stock: { $gt: 0 },
        category: { $in: browsable },
        // Name, brand and tags only. NOT description: a product whose
        // description happens to contain the word is a poor suggestion, and
        // it is how "gift" returns everything in the shop.
        $or: [{ name: rx }, { brand: rx }, { tags: rx }],
      })
        .select('name slug price salePrice saleStartsAt saleEndsAt mrp images category')
        .populate('category', 'name')
        .sort({ totalReviews: -1, createdAt: -1 })
        .limit(6)
        .lean(),

      Category.find({ _id: { $in: browsable }, name: rx })
        .select('name slug')
        .limit(3)
        .lean(),
    ]);

    return res.json({
      // Built field by field: this response is public and a `.lean()` document
      // grows new fields every time somebody edits the model.
      products: products.map((p) => ({
        _id: p._id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        /*
         * The sale WINDOW comes too, not just the sale price. priceOf() on the
         * front end checks it, and without these two fields a sale scheduled
         * for next week would be shown as today's price in the suggestions and
         * as the normal price on the card two clicks later.
         */
        salePrice: p.salePrice,
        saleStartsAt: p.saleStartsAt,
        saleEndsAt: p.saleEndsAt,
        mrp: p.mrp,
        image: p.images?.[0] || null,
        categoryName: p.category?.name || null,
      })),
      categories: categories.map((c) => ({ _id: c._id, name: c.name, slug: c.slug })),
    });
  } catch (error) {
    console.error('SUGGEST ERROR:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

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
exports.filters = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, color, size, minRating } = req.query;

    /*
     * Each facet is counted with every filter EXCEPT ITS OWN. Applying colour
     * before counting colours would leave the panel showing the one colour
     * already chosen, with no way back to the others; the same is true of size.
     */
    const forColours = await buildCatalogueFilter({
      category, search, minPrice, maxPrice, size, minRating,
    });
    const forSizes = await buildCatalogueFilter({
      category, search, minPrice, maxPrice, color, minRating,
    });
    if (forColours.notFound) return res.status(404).json({ message: 'Category not found' });
    if (forColours.empty) return res.json({ colors: [], sizes: [], price: null });

    // The price slider's ends come from the category and search alone. Deriving
    // them from the current price filter would shrink the slider each time it
    // was moved, and there would be no way to widen it again.
    const forPrices = await buildCatalogueFilter({ category, search });

    const [colors, sizes, priceRange] = await Promise.all([
      Product.aggregate([
        { $match: forColours.filter },
        { $match: { color: { $nin: [null, ''] } } },
        { $group: { _id: '$color', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      Product.aggregate([
        { $match: forSizes.filter || {} },
        { $match: { size: { $nin: [null, ''] } } },
        { $group: { _id: '$size', count: { $sum: 1 } } },
        // Alphabetical, not by count: a size list reads as a sequence, and
        // "S, M, L" ordered by popularity is a list nobody can scan.
        { $sort: { _id: 1 } },
      ]),
      Product.aggregate([
        { $match: forPrices.filter },
        { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
      ]),
    ]);

    res.json({
      colors: colors.map((c) => ({ value: c._id, count: c.count })),
      sizes: sizes.map((c) => ({ value: c._id, count: c.count })),
      price: priceRange[0]
        ? { min: Math.floor(priceRange[0].min), max: Math.ceil(priceRange[0].max) }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ✅ GET single product details (PUBLIC)
 *  URL: /api/public/products/:productId
 */
exports.getProduct = async (req, res) => {
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

    /*
     * The other sizes of this same thing.
     *
     * Each size is its own product row - that is how Google models variants and
     * it kept the cart, stock reservation and orders untouched. The cost is
     * that the PAGE has to put them back together, so it is done here rather
     * than by the browser making a second request it would have to know to
     * make.
     *
     * Sold-out sizes are included on purpose: a size selector that silently
     * omits the one somebody wants reads as "we never made it", and Baymard's
     * finding on out-of-stock variants is that showing them as unavailable is
     * what stops the search continuing elsewhere.
     */
    let variants = [];
    if (product.variantGroupId) {
      variants = await Product.find({
        variantGroupId: product.variantGroupId,
        isActive: true,
        isDeleted: { $ne: true },
      })
        .select('name slug size price salePrice saleStartsAt saleEndsAt stock reserved')
        .sort({ price: 1 })
        .lean();
    }

    const [withShopName] = await withShop([product]);
    res.json({ product: withShopName, variants });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

