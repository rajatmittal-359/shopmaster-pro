const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

// Get all products (with filters) - PUBLIC
router.get('/', async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, page = 1, limit = 20 } = req.query;

    const filter = { isActive: true, stock: { $gt: 0 } };

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('sellerId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single product details - PUBLIC
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

// Get all categories - PUBLIC
router.get('/categories/all', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .select('name description')
      .sort({ name: 1 });

    res.json({
      count: categories.length,
      categories
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
