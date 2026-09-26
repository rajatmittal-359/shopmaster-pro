const express = require('express');
const sellerCtrl = require('../controllers/sellerController');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

const {
  getSellerProfile,
  getMyProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  updateStock,
  getLowStockProducts,
  getMyOrders,
  getOrderDetails,
  updateOrderStatus,
  getSellerAnalytics,
  updateTracking
} = require('../controllers/sellerController');

const checkSellerStatus = require('../middlewares/checkSellerStatus');
const { requireApprovedSeller } = require('../middlewares/checkSellerStatus');
router.use(authMiddleware, roleMiddleware('seller'), checkSellerStatus);

// Read-only routes stay available to an unapproved seller so they can still see
// their own dashboard and the "account under review" state.
router.get('/profile', getSellerProfile);
// The application itself (plan 2.40) - readable and editable while the shop waits.
router.get('/application', sellerCtrl.getMyApplication);
router.patch('/application', sellerCtrl.updateMyApplication);


router.get('/products', getMyProducts);
router.get('/products/low-stock', getLowStockProducts);
router.get('/products/:id', getProductById);

router.get('/orders', getMyOrders);
router.get('/orders/:orderId', getOrderDetails);

router.get('/analytics', getSellerAnalytics);

// Capabilities that admin approval is meant to unlock: listing/altering catalogue
// and fulfilling orders. Previously these were reachable by any non-suspended
// seller, which made approve/reject purely cosmetic.
router.post('/products', requireApprovedSeller, addProduct);
router.patch('/products/:productId', requireApprovedSeller, updateProduct);
router.delete('/products/:productId', requireApprovedSeller, deleteProduct);
router.patch('/products/:productId/stock', requireApprovedSeller, updateStock);

router.patch('/orders/:orderId/status', requireApprovedSeller, updateOrderStatus);
router.patch('/orders/:orderId/tracking', requireApprovedSeller, updateTracking);

// Book the courier the customer paid for, once the parcel is packed. Nothing
// reaches a courier before this is pressed.
const { shipOrder, cancelShipment, cancelOwnLines } = require('../controllers/sellerController');
router.post('/orders/:orderId/ship', requireApprovedSeller, shipOrder);
router.post('/orders/:orderId/ship/cancel', requireApprovedSeller, cancelShipment);

// Calling off the ORDER, not just the courier. See cancelOwnLines.
router.post('/orders/:orderId/cancel', requireApprovedSeller, cancelOwnLines);

// Closing out a return. Receiving the goods back is what pays the refund;
// refusing needs a reason the customer can dispute.
router.post(
  '/orders/:orderId/return',
  requireApprovedSeller,
  require('../controllers/sellerController').settleReturn
);

// Fair Returns (plan §4.39): evidence on the seller's side.
const fair = require('../controllers/fairReturnsController');
router.post('/orders/:orderId/pack-proof', requireApprovedSeller, fair.packProof);
router.post('/orders/:orderId/receipt-check', requireApprovedSeller, fair.receiptCheck);
router.post('/orders/:orderId/dispute/respond', requireApprovedSeller, fair.disputeRespond);

/*
 * The AI a seller can reach. Approved sellers only - these spend a free
 * allowance that belongs to the whole platform, and an unapproved account has
 * no products to improve yet.
 */
const ai = require('../controllers/aiController');
router.get('/ai/usage', requireApprovedSeller, ai.getUsage);
router.get('/ai/catalog', requireApprovedSeller, ai.getCatalog);
router.patch('/ai/limits', requireApprovedSeller, ai.setLimits);
router.get('/search/queries', requireApprovedSeller, require('../controllers/searchInsightsController').sellerQueries);

// The pages every marketplace panel has (13 Sep): issues, promotions, performance, sidebar counts.
const panel = require('../controllers/panelController');
router.get('/issues', requireApprovedSeller, panel.sellerIssues);
router.get('/coupons', requireApprovedSeller, panel.sellerCoupons);
router.post('/coupons', requireApprovedSeller, panel.createSellerCoupon);
router.patch('/coupons/:couponId/toggle', requireApprovedSeller, panel.toggleSellerCoupon);
router.get('/performance', requireApprovedSeller, panel.sellerPerformance);
router.get('/nav-counts', panel.sellerNavCounts);
router.get('/grow', requireApprovedSeller, require('../controllers/growController').sellerGrow);
const assist = require('../controllers/assistController');
router.post('/assist', requireApprovedSeller, assist.seller);
router.patch('/assist/:id', assist.rate);
router.post('/voice/transcribe', require('../controllers/voiceController').transcribe);
router.get('/category-requests', requireApprovedSeller, panel.myCategoryRequests);
router.post('/category-requests', requireApprovedSeller, panel.requestCategory);
router.post('/ai/listing', requireApprovedSeller, ai.writeListing);
router.post('/ai/listing-from-speech', requireApprovedSeller, ai.listingFromSpeech);
router.post('/ai/refine', requireApprovedSeller, ai.refineText);
router.post('/ai/keywords', requireApprovedSeller, ai.suggestKeywords);
router.post('/ai/market', requireApprovedSeller, ai.marketCheck);
router.post('/ai/faqs', requireApprovedSeller, ai.draftFaqs);
// The seller's own listing from another marketplace, read once and handed to
// the form as a draft (utils/ai/importListing). Approved sellers only.
router.post('/ai/import', requireApprovedSeller, ai.importFromUrl);
// The Google coach's shop-level list for Grow (plan 2.32)
router.get('/google/readiness', requireApprovedSeller, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, max-age=120');
    res.json(await require('../utils/googleReadiness').shopReadiness(req.user._id));
  } catch (error) {
    require('../utils/apiError').sendError(res, error);
  }
});
router.get('/products/:productId/google', requireApprovedSeller, require('../controllers/searchInsightsController').productGoogle);
// Everything ABOUT one listing that the edit form cannot show: what it sold,
// how often it was opened. The report page (plan 4.62) joins it with Google's.
router.get('/products/:productId/report', requireApprovedSeller, require('../controllers/productReportController').productReport);
router.post('/ai/image', requireApprovedSeller, ai.makeImage);
router.post('/ai/attach', requireApprovedSeller, ai.attachToProduct);
router.get('/ai/drafts', requireApprovedSeller, ai.listDrafts);

// A seller's own shop settings: whether they absorb delivery, and the address a
// courier collects from.
router.get('/settings', sellerCtrl.getSettings);
router.post('/agreement/accept', sellerCtrl.acceptAgreement);
router.patch('/settings', sellerCtrl.updateSettings);

// A seller's own earnings, settlement history and the account they are paid into.
const {
  getMyEarnings,
  getMyPayoutDetails,
  updateMyPayoutDetails,
} = require('../controllers/payoutController');

router.get('/earnings', getMyEarnings);
router.get('/payout-details', getMyPayoutDetails);
// Step-up: where the money goes changes only with the password just typed (middlewares/requireRecentAuth).
router.patch('/payout-details', require('../middlewares/requireRecentAuth'), updateMyPayoutDetails);

module.exports = router;