// backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const ctl = require('../controllers/productController');

// Public catalogue. Order matters: the literal paths must be registered
// before '/:productId' or "suggest" and "filters" would be read as ids.
router.get('/categories/all', ctl.listAllCategories);
// The listing template for a category (config/listingTemplates): the seller
// form asks its questions, the shop draws its facets. Public - it is the shape
// of a listing, not data.
router.get('/categories/:id/template', async (req, res) => {
  try {
    const { templateForCategoryId } = require('../utils/listingTemplate');
    const mongoose = require('mongoose');
    const t = mongoose.isValidObjectId(req.params.id) ? await templateForCategoryId(req.params.id) : require('../config/listingTemplates').TEMPLATES.general;
    /*
     * The category's real search words ride along with its questions
     * (28 Sep 2026). They belong on this request and not on one of their
     * own: the form already makes it the moment a category is chosen, both
     * answers are public, and both are stale-by-the-week - the template
     * changes when we edit it, the words when the Monday job runs.
     *
     * A second endpoint would have meant a second round trip on a phone on
     * mobile data, to say something we could have said here.
     */
    const { categoryWords } = require('../utils/categoryWords');
    const words = await categoryWords(req.params.id);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      template: { key: t.key, label: t.label, productTypes: t.productTypes, attributes: t.attributes, legal: t.legal, title: t.title },
      words,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.get('/categories/tree', ctl.categoryTree);
router.get('/', ctl.listProducts);
router.get('/suggest', ctl.suggest);
router.get('/by-ids', ctl.byIds);
router.get('/filters', ctl.filters);
router.get('/:productId/similar', ctl.similarProducts);
router.get('/:productId', ctl.getProduct);
// The view beacon: unauthenticated, writes one counter, and is rate limited
// because anything unauthenticated that writes will eventually be poked at.
router.post('/:productId/view', require('../middlewares/rateLimits').viewLimiter, ctl.countProductView);

module.exports = router;
