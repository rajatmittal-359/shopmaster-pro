// backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const ctl = require('../controllers/productController');

// Public catalogue. Order matters: the literal paths must be registered
// before '/:productId' or "suggest" and "filters" would be read as ids.
router.get('/categories/all', ctl.listAllCategories);
router.get('/categories/tree', ctl.categoryTree);
router.get('/', ctl.listProducts);
router.get('/suggest', ctl.suggest);
router.get('/filters', ctl.filters);
router.get('/:productId', ctl.getProduct);

module.exports = router;
