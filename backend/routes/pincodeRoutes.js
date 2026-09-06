const express = require('express');
const router = express.Router();
const { lookup } = require('../utils/pincode');

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

module.exports = router;
