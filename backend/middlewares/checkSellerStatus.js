// backend/middlewares/checkSellerStatus.js
const Seller = require('../models/Seller');

module.exports = async (req, res, next) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id }); // tumhare model ke hisaab se userId check karo
    if (!seller) {
      return res.status(403).json({ message: 'Seller profile not found' });
    }

    if (seller.status === 'suspended') {
      return res
        .status(403)
        .json({ message: 'Your seller account has been suspended by admin' });
    }

    req.seller = seller;
    next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
