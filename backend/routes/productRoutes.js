// backend/routes/productRoutes.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
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
router.get('/', async (req, res) => {
  try {
    const {
      category,
      search,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { isActive: true, stock: { $gt: 0 } };

    // A category contains everything beneath it. Selecting a main category
    // returns its whole subtree, not just products pinned directly to it
    // (products live on leaves, so an exact match always returned nothing).
    // getBrowsableIds also drops any category sitting under a deactivated
    // parent, so switching off a parent hides its products too.
    if (category) {
      // Accept a slug or an ObjectId, so /shop?category=rings is a real,
      // shareable, indexable URL and existing id-based links keep working.
      let categoryId = category;
      if (!mongoose.isValidObjectId(category)) {
        const bySlug = await Category.findOne({ slug: category }).select('_id').lean();
        // A category that does not exist is a 404, not an empty result page.
        // Answering 200 with zero products creates a "soft 404": Google indexes
        // the empty page as real content. Its JS SEO guidance calls this out
        // explicitly, and it applies to any URL a crawler can reach.
        if (!bySlug) {
          return res.status(404).json({ message: 'Category not found' });
        }
        categoryId = bySlug._id;
      }
      const categoryIds = await Category.getBrowsableIds(categoryId);
      if (categoryIds.length === 0) {
        return res.json({ products: [], totalPages: 0, currentPage: 1, total: 0 });
      }
      filter.category = { $in: categoryIds };
    } else {
      // No category selected: still exclude products whose category (or any of
      // its ancestors) has been deactivated.
      filter.category = { $in: await Category.getBrowsableIds() };
    }

    // Text/regex search
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };

      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { brand: searchRegex },
        { tags: searchRegex } // tags is array of strings
      ];
    }


    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const numericLimit = Number(limit) || 20;
    const numericPage = Number(page) || 1;

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('sellerId', 'name')
      .sort({ createdAt: -1 })
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
