// backend/controllers/wishlistController.js
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

// GET /api/customer/wishlist
exports.getWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ userId: req.user._id })
      .populate('items.productId', 'name price images stock lowStockThreshold isActive');

    if (!wishlist) {
      wishlist = await Wishlist.create({ userId: req.user._id, items: [] });
    }

    // Filter out products that no longer exist or are inactive
    wishlist.items = wishlist.items.filter(
      (item) => item.productId && item.productId.isActive !== false
    );

    await wishlist.save();

    res.json({ wishlist });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/customer/wishlist
// body: { productId }
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: 'productId is required' });
    }

    const product = await Product.findById(productId);

    if (!product || !product.isActive || product.stock <= 0) {
      return res.status(400).json({ message: 'Product not available' });
    }

    let wishlist = await Wishlist.findOne({ userId: req.user._id });

    if (!wishlist) {
      wishlist = new Wishlist({ userId: req.user._id, items: [] });
    }

    const alreadyExists = wishlist.items.some(
      (item) => item.productId.toString() === productId
    );

    if (!alreadyExists) {
      wishlist.items.push({ productId });
      await wishlist.save();
    }

    await wishlist.populate('items.productId', 'name price images stock lowStockThreshold isActive');

    res.status(201).json({
      message: alreadyExists ? 'Already in wishlist' : 'Added to wishlist',
      wishlist,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/customer/wishlist/:productId
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const wishlist = await Wishlist.findOne({ userId: req.user._id });

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    wishlist.items = wishlist.items.filter(
      (item) => item.productId.toString() !== productId
    );

    await wishlist.save();
    await wishlist.populate('items.productId', 'name price images stock lowStockThreshold isActive');

    res.json({
      message: 'Item removed from wishlist',
      wishlist,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/customer/wishlist
exports.clearWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user._id });

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    wishlist.items = [];
    await wishlist.save();

    res.json({
      message: 'Wishlist cleared',
      wishlist,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
