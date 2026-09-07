const express = require('express');
const router = express.Router();
const { lookup } = require('../utils/pincode');
const { estimateDelivery, isValidPincode } = require('../utils/deliveryEstimate');

/**
 * GET /api/pincode/:code
 *
 * Public on purpose: someone filling in a delivery address has not signed in
 * yet on the checkout path, and there is nothing private in a PIN code.
 */
router.get('/:code', async (req, res) => {
  try {
    const result = await lookup(req.params.code);

    if (!result) {
      // 404 means "no such PIN code" - a thing the form should say out loud.
      return res.status(404).json({ message: 'No such PIN code' });
    }

    // PIN codes do not move. Letting the browser keep the answer saves the
    // round trip when someone corrects a typo and comes back to the same one.
    res.set('Cache-Control', 'public, max-age=86400');
    return res.json(result);
  } catch (err) {
    // 503, not 404: the PIN code may be perfectly good and we could not check.
    // The form must let the person type city and state themselves rather than
    // telling them their address is wrong.
    console.error('PIN code lookup failed:', err.message);
    return res
      .status(503)
      .json({ message: 'Could not check that PIN code right now' });
  }
});

/**
 * GET /api/pincode/:code/delivery
 *
 * "Get it by Friday" for the product page, before there is a cart or a login.
 *
 * PUBLIC AND UNAUTHENTICATED, so it is written defensively: the PIN code is
 * validated before anything is called, the answer is cached for six hours in
 * `deliveryEstimate`, and the response is cacheable by the browser too. Without
 * all three, a crawler walking every product page would spend our Shiprocket
 * rate limit for us.
 */
router.get('/:code/delivery', async (req, res) => {
  const { code } = req.params;

  if (!isValidPincode(code)) {
    return res.status(400).json({ message: 'That is not a PIN code' });
  }

  try {
    const estimate = await estimateDelivery(code);

    // Six hours, matching the server-side cache. A delivery date is not
    // personal - it is the same answer for everyone asking about that PIN code
    // - so a shared cache may hold it.
    res.set('Cache-Control', 'public, max-age=21600');
    return res.json(estimate);
  } catch (err) {
    // 503 and no number. A date we could not check is worse than no date: the
    // page simply does not show one, and nobody is promised anything.
    console.error('Delivery estimate failed:', err.message);
    return res
      .status(503)
      .json({ message: 'Could not check delivery for that PIN code right now' });
  }
});

module.exports = router;
