const { hasRecentAuth } = require('../utils/auth/session');

/**
 * Step-up (19 Sep 2026): the password again before money or identity moves.
 *
 * A session that is weeks old is fine for browsing and ordering; it is not
 * enough proof to change where a seller's money goes, to pay a payout, to
 * rule on a dispute or to change a commission. Amazon asks for the password
 * before a payment method changes; Flipkart sends an OTP. Ours: POST
 * /auth/reauth with the password sets a ten-minute cookie, and the routes
 * behind this middleware answer 401 { code: 'reauth' } until it is there.
 * The page catches that code, asks for the password in a dialog, and
 * retries - the person sees one extra field, not an error.
 */
module.exports = (req, res, next) => {
  if (hasRecentAuth(req)) return next();
  return res.status(401).json({ message: 'Please confirm your password to continue.', code: 'reauth' });
};
