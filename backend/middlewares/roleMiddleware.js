// backend/middlewares/roleMiddleware.js
const { capabilitiesFor } = require('../utils/capabilities');

/**
 * Does this account have what the route needs?
 *
 * WHAT CHANGED, AND WHY
 *   This used to read `req.user.role` and compare it to a list. That made an
 *   account exactly one thing: the platform's own shop could not buy from its
 *   own marketplace, and a customer who wanted to sell had to make a second
 *   account with a second email.
 *
 *   Now it asks what the account CAN DO. Buying needs no role; selling needs a
 *   Seller record, which is the thing an admin actually approves; admin is
 *   still a role, because it is one.
 *
 * WHAT DID NOT CHANGE
 *   The call sites. Every route still says roleMiddleware('seller') or
 *   roleMiddleware(['admin', 'seller']), and the seller routes still run
 *   checkSellerStatus and requireApprovedSeller after this - suspension and
 *   approval are their decisions, not this file's.
 *
 * THE RULE THIS ENFORCES
 *   Never trust the token for authorisation. The token says who is asking; the
 *   database says what they may do. A token minted before a suspension keeps
 *   claiming "seller" until it expires, and honouring that claim would let a
 *   suspended shop keep trading for a week.
 */
const roleMiddleware = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      /*
       * Only ask about selling when the route needs it. Otherwise every cart
       * read and every order page would carry a Seller lookup for a fact it
       * never uses.
       */
      const can = await capabilitiesFor(req.user, { includeSeller: roles.includes('seller') });

      // `can` carries the same three names the routes ask for, so the check is
      // a lookup rather than a translation table that can fall out of step.
      const allowed = roles.some((role) => can[role]);

      if (!allowed) {
        return res.status(403).json({
          message: 'Access denied. Insufficient permissions.',
          requiredRoles: roles,
          /*
           * Deliberately reports the CAPABILITIES, not `user.role`. When a
           * seller is refused, "yourRole: seller" was actively misleading -
           * the reason was usually that no Seller record existed at all.
           */
          yourCapabilities: Object.entries(can)
            .filter(([key, value]) => value === true && key !== 'sellerApproved')
            .map(([key]) => key),
        });
      }

      // Handed on so a controller does not have to ask again.
      req.capabilities = can;
      return next();
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  };
};

module.exports = roleMiddleware;
