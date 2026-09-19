const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const {
  getAllSellers,
  approveSeller,
  rejectSeller,
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getAnalytics,
  suspendSeller,
  activateSeller,
  getAllOrders,
  getOrderById
} = require('../controllers/adminController');

const {
  getPayableSellers,
  createPayout,
  listPayouts,
  settlePayout,
  failPayout,
} = require('../controllers/payoutController');

// All routes require admin role
router.use(authMiddleware, roleMiddleware('admin'));

// Seller management
// NOTE: the path says "pending" but this returns EVERY seller, whatever their
// approval state. The frontend depends on the path, so it is left as-is rather
// than renamed; the handler name is the accurate one.
router.get('/sellers/pending', getAllSellers);
router.patch('/sellers/:sellerId/approve', approveSeller);
router.patch('/sellers/:sellerId/reject', rejectSeller);
router.patch('/sellers/:sellerId/ask', require('../controllers/adminController').askSeller);
// Edit a shop's public details on its behalf (plan 2.42) - never the bank.
router.get('/sellers/:sellerId/shop', require('../controllers/adminController').getSellerShop);
router.patch('/sellers/:sellerId/shop', require('../controllers/adminController').editSellerShop);
router.patch('/sellers/:sellerId/suspend', suspendSeller);
router.patch('/sellers/:sellerId/activate', activateSeller);

// Category management
router.post('/categories', createCategory);
router.get('/categories', getCategories);
router.patch('/categories/:categoryId', updateCategory);
router.delete('/categories/:categoryId', deleteCategory);

// Order operations (read-only platform visibility)
router.get('/orders', getAllOrders);
router.get('/orders/:orderId', getOrderById);

// The platform stepping in. See cancelOrderAsAdmin - the admin could read
// orders and do nothing about them.
router.post('/orders/:orderId/cancel', require('../controllers/adminController').cancelOrderAsAdmin);

// The referee. Somebody has to be able to decide when a customer and a seller
// disagree about what happened, and to be seen to have decided.
router.post(
  '/orders/:orderId/dispute/resolve',
  require('../controllers/adminController').resolveDispute
);

// What the platform charges one seller. Rates are snapshotted onto orders when
// they are placed, so this only ever changes what happens from here on.
router.patch(
  '/sellers/:sellerId/commission',
  require('../controllers/adminController').setSellerCommission
);

// Coupons. An admin may create either kind; a seller may only fund their own.
const adminCtrl = require('../controllers/adminController');
router.get('/coupons', adminCtrl.listCoupons);
router.post('/coupons', adminCtrl.createCoupon);
router.patch('/coupons/:couponId/toggle', adminCtrl.toggleCoupon);

// Analytics
router.get('/analytics', getAnalytics);

// Seller settlements. What is owed, and recording that it was transferred.
router.get('/payouts/payable', getPayableSellers);
router.get('/payouts', listPayouts);
router.post('/payouts', createPayout);
router.patch('/payouts/:payoutId/paid', settlePayout);
router.patch('/payouts/:payoutId/failed', failPayout);

// Today's AI spend across the platform, and who used it. Read-only.
const ai = require('../controllers/aiController');
router.get('/ai/usage', ai.adminUsage);
router.get('/ai/roads', ai.adminRoads);
router.get('/ai/catalog', ai.getCatalog);
router.patch('/ai/limits', ai.setLimits);
router.get('/search/queries', require('../controllers/searchInsightsController').adminQueries);
router.get('/google/products', require('../controllers/searchInsightsController').adminGoogleProducts);
const panel = require('../controllers/panelController');
router.get('/products', panel.adminProducts);
router.get('/customers', panel.adminCustomers);
router.patch('/customers/:userId/block', panel.setCustomerBlocked);
router.get('/nav-counts', panel.adminNavCounts);
// Fair Returns + the decision agent (plan §4.39, 2.19)
const fair = require('../controllers/fairReturnsController');
router.get('/customers/:id/risk', fair.customerRisk);
router.patch('/customers/:id/risk', fair.setCustomerRisk);
router.get('/sellers/:userId/risk', fair.sellerRisk);
router.post('/orders/:orderId/return/approve', fair.approveReturn);
router.get('/orders/:orderId/dispute-brief', fair.disputeBrief);
// The Trust queue (plan 2.22)
const trust = require('../controllers/trustController');
router.get('/trust', trust.queue);
router.patch('/trust/reviews/:id', trust.reviewAction);
router.patch('/trust/sellers/:userId/about', trust.aboutAction);

const assist = require('../controllers/assistController');
router.post('/assist', assist.admin);
router.patch('/assist/:id', assist.rate);
router.get('/assist', assist.adminLogs);
router.get('/assist/evals', assist.adminEvals);
router.post('/voice/transcribe', require('../controllers/voiceController').transcribe);
const settings = require('../controllers/settingsController');
router.get('/settings', settings.getSettings);
router.patch('/settings', settings.updateSettings);
router.get('/category-requests', panel.adminCategoryRequests);
// The Saturday mail, on demand: read it now, or send it now.
router.get('/digest', async (req, res) => {
  try {
    const { gather, render } = require('../jobs/weeklyDigest');
    const data = await gather();
    const mail = render(data);
    res.json({ data, subject: mail.subject, html: mail.html });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.post('/digest/send', async (req, res) => {
  try {
    const r = await require('../jobs/weeklyDigest').sendWeeklyDigest();
    res.json({ sent: r.sent, subject: require('../jobs/weeklyDigest').render(r.data).subject });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.patch('/category-requests/:requestId', panel.decideCategoryRequest);
router.get('/google/traffic', require('../controllers/searchInsightsController').adminTraffic);
router.get('/google/speed', require('../controllers/searchInsightsController').adminSpeed);
router.get('/google/market', require('../controllers/searchInsightsController').adminMarket);
router.post('/ai/listing', ai.writeListing);
router.post('/ai/refine', ai.refineText);
router.post('/ai/keywords', ai.suggestKeywords);
// Banners and category art from words - the one image mode sellers do not get.
router.post('/ai/image', ai.makeImage);
router.post('/ai/attach', ai.attachToProduct);
router.get('/ai/drafts', ai.listDrafts);

module.exports = router;
