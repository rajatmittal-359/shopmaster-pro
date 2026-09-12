const rateLimit = require('express-rate-limit');

/**
 * How many times one address may knock on the doors that matter.
 *
 * WHAT WAS OPEN
 *   Nothing stopped a script from trying passwords against /auth/login all
 *   night, or from asking for ten thousand password-reset emails for one
 *   address (each one an email we pay Brevo for), or from burning the whole
 *   platform's daily AI image allowance in a loop. OWASP A06 names rate
 *   limiting as a design control, not an add-on.
 *
 * THE NUMBERS
 *   Generous for a person, hopeless for a script. A real customer does not
 *   mistype a password twenty times in fifteen minutes; a shop does not ask
 *   the AI for sixty pictures in fifteen minutes (the per-user daily caps in
 *   aiController are the real budget - this only stops a loop from reaching
 *   them in seconds).
 *
 * WHERE IT COUNTS
 *   In memory, per process. One Render instance today, so that is honest; the
 *   day there are two, pass a shared `store` here and nothing else changes.
 *   Render sits behind a proxy, so `trust proxy` is set in app.js and the
 *   address counted is the visitor's, not the load balancer's.
 */
const WINDOW_MS = 15 * 60 * 1000;

const LIMITS = {
  auth: { max: 20, what: 'sign-in attempts' },
  checkout: { max: 40, what: 'checkout attempts' },
  ai: { max: 40, what: 'AI requests' },
};

const limiter = ({ max, what }) =>
  rateLimit({
    windowMs: WINDOW_MS,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // The test suite fires hundreds of requests from one address in seconds.
    // Off under test unless a test asks for it (hardening.test.mjs does).
    skip: () => process.env.NODE_ENV === 'test' && !process.env.RATE_LIMIT_TEST,
    // Written for the person who sees it, which will occasionally be a real
    // one: a shared office connection, a family on one router.
    message: {
      message: `Too many ${what} from this connection. Please wait 15 minutes and try again.`,
    },
  });

module.exports = {
  LIMITS,
  authLimiter: limiter(LIMITS.auth),
  checkoutLimiter: limiter(LIMITS.checkout),
  aiLimiter: limiter(LIMITS.ai),
};
