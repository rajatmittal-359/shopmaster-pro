// backend/middlewares/checkSellerStatus.js
const Seller = require('../models/Seller');

/**
 * Loads the seller profile and blocks suspended accounts.
 * Read-only seller routes use this alone, so an unapproved seller can still
 * sign in and see their "account under review" dashboard.
 */
const checkSellerStatus = async (req, res, next) => {
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

/**
 * Gates the capabilities that admin approval is supposed to unlock.
 *
 * The lifecycle already in the schema is: Seller.isApproved (false by default,
 * set true by adminController.approveSeller and false by rejectSeller), with
 * Seller.status as a separate active/suspended axis. Nothing read isApproved,
 * so the approval workflow had no effect on what a seller could actually do.
 *
 * Must run after checkSellerStatus, which populates req.seller.
 */
const requireApprovedSeller = (req, res, next) => {
  if (!req.seller) {
    return res.status(403).json({ message: 'Seller profile not found' });
  }

  if (!req.seller.isApproved) {
    return res.status(403).json({
      message:
        'Your seller account is pending admin approval. You can browse your dashboard, but cannot list products or manage orders until it is approved.',
      kycStatus: req.seller.kycStatus,
      isApproved: false,
    });
  }

  next();
};

module.exports = checkSellerStatus;
module.exports.checkSellerStatus = checkSellerStatus;
module.exports.requireApprovedSeller = requireApprovedSeller;
