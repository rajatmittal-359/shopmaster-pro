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
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ template: { key: t.key, label: t.label, productTypes: t.productTypes, attributes: t.attributes, legal: t.legal, title: t.title } });
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

module.exports = router;
