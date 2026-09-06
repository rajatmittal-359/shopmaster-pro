const express = require('express');
const router = express.Router();
const { courierUpdate } = require('../controllers/logisticsController');

/**
 * Tracking updates pushed by the courier.
 *
 * Public by necessity - the courier cannot sign in - and authenticated by the
 * x-api-key header instead, checked in the controller.
 *
 * The path deliberately avoids the words "shiprocket", "sr" and "kr":
 * Shiprocket refuses to register a webhook URL containing them.
 */
router.post('/track', courierUpdate);

module.exports = router;
