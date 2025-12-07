// backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

/**
 * ✅ GET all active categories (PUBLIC)
 *  URL: /api/public/products/categories/all
 *  Note: Isko sabse upar rakha hai, taaki /:productId se clash na ho.
 */
router.get('/categories/all', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .select('name description')
      .sort({ name: 1 });

    res.json({
      count: categories.length,
      categories,
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

    if (category) {
      filter.category = category;
    }

    // Text/regex search
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
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

    const product = await Product.findById(productId)
      .populate('category', 'name description')
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
