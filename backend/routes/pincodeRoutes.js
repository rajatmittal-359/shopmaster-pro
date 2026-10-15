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
    // ?product=<id or slug>: a made-to-order item's own ready-to-ship days go
    // into the date (utils/dispatch). Read here, never trusted from the query.
    let dispatchDays;
    let pickupPincode = null;
    let sameDay = false;
    if (req.query.product) {
      const Product = require('../models/Product');
      const Seller = require('../models/Seller');
      const mongoose = require('mongoose');
      const key = String(req.query.product);
      const p = await Product.findOne(mongoose.isValidObjectId(key) ? { $or: [{ _id: key }, { slug: key }] } : { slug: key }).select('processingDays sellerId').lean().catch(() => null);
      if (p) {
        dispatchDays = require('../utils/dispatch').processingDaysOf(p);
        // The seller's own pickup pincode decides the transit (2.54); the house shop keeps the default.
        const s = p.sellerId ? await Seller.findOne({ userId: p.sellerId }).select('isPlatformOwned pickupAddress').lean().catch(() => null) : null;
        const pin = s && !s.isPlatformOwned ? String(s.pickupAddress?.pincode || '').trim() : '';
        if (/^\d{6}$/.test(pin)) pickupPincode = pin;

        /*
         * "You can have it today" belongs beside the price, not three pages
         * later at checkout - which is where it has lived until now. Amazon
         * and Flipkart both put the delivery promise on the product page for
         * the same reason: that is where the decision is made.
         *
         * WHAT THIS GOT WRONG, AND HOW (15 Oct 2026)
         *   It was built to answer from local gates alone, never calling
         *   Borzo, on the reasoning that only the PRICE is Borzo's to give.
         *   One gate was missing: whether Borzo is in that city at all.
         *   `sameDayPickupFor` asks for an address, a phone and a name and
         *   nothing about coverage, so a seller in Nasirabad was told to
         *   promise a rider - and Borzo, asked on the live account, returned
         *   null for Nasirabad 305601 and Ajmer 305001 both. The page was
         *   promising what the courier had already refused.
         *
         *   The same prefix was wrong the other way too: the house shop in
         *   302019 was refused Chomu 303702 because 302 !== 303, while Borzo
         *   quotes that trip at Rs 445. A sale lost to a string comparison.
         *
         *   So: distance first, from the two points we already store and
         *   index, which costs nothing and stops the pointless questions; then
         *   BORZO decides, cached per PIN, because their answer is the
         *   coverage list and no list of ours could stay true. A bare PIN is
         *   enough for them - 302001 priced the same with and without a city -
         *   which is exactly what a product page has.
         *
         *   Still not a booking, and still no price here. The checkout re-asks
         *   with the real address and weight and is still free to say no.
         */
        const { sameDayPossible, withinLocalRadius } = require('../utils/shipping');
        const borzo = require('../utils/borzo');
        const { liveSettings } = require('../utils/liveSettings');
        const live = await liveSettings().catch(() => null);
        const pickupPoint = borzo.sameDayPickupFor(s);
        // null when the map cannot say; `sameDayPossible` then keeps the proxy.
        // No pickup means there is nothing to measure a distance FROM, so the
        // lookup is skipped rather than cached for an offer that cannot exist.
        const local = pickupPoint ? await withinLocalRadius(s, code).catch(() => null) : null;
        const possible = sameDayPossible({
          pickupPoint,
          pickupPin: pickupPincode,
          deliveryPincode: code,
          // `isMadeToOrder`, not a second copy of the rule: longer than the
          // RULEBOOK, which is the line the checkout draws too (shipping.js
          // `extra`). The copy that lived here said `> 0`, so a seller who
          // typed the rulebook's own number lost same-day on the product page
          // and got it back at the till - the page refusing what we would sell.
          madeToOrder: require('../utils/dispatch').isMadeToOrder(p),
          sameDayEnabled: live?.shop?.sameDayEnabled,
          local,
        });
        sameDay = possible ? await borzo.carriesSameDay(code, pickupPoint) : false;
      }
    }
    const estimate = await estimateDelivery(code, { ...(dispatchDays ? { dispatchDays } : {}), ...(pickupPincode ? { pickupPincode } : {}) });

    // Six hours, matching the server-side cache. A delivery date is not
    // personal - it is the same answer for everyone asking about that PIN code
    // - so a shared cache may hold it.
    res.set('Cache-Control', dispatchDays ? 'public, max-age=3600' : 'public, max-age=21600');
    // `sameDay` is per product AND per PIN, which the cache key above already
    // is, so it rides along with the date rather than needing a second call.
    return res.json({ ...estimate, sameDay });
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
