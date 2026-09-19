/**
 * Cloudflare Turnstile - the bot check on the two doors bots try (plan 2.28,
 * 19 Sep 2026): creating an account and applying to sell.
 *
 * WHY TURNSTILE AND NOT reCAPTCHA
 *   Free without limits, no puzzle for a person on a phone (Managed mode
 *   shows a checkbox at most), no Google account data in the exchange, and
 *   the same Cloudflare account the AI gateway already lives in. Flipkart
 *   and Meesho gate sign-up with an OTP for the same reason; ours already
 *   sends one, so this stops the traffic BEFORE the mail goes out.
 *
 * HOW
 *   The page renders the widget with the public site key and sends the
 *   token it produces as `turnstileToken`. This middleware asks Cloudflare
 *   whether that token is real (siteverify, the secret never leaves the
 *   server). A missing or bad token is a 400 in words; a Cloudflare outage
 *   is NOT - a form that cannot be submitted because a third party is down
 *   is worse than one bot getting through, so a network failure lets the
 *   request pass and is logged.
 *
 * OFF BY DEFAULT
 *   Without TURNSTILE_SECRET nothing is checked - the laptop, tests and
 *   any deploy that has not been given the key behave as before.
 */
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const enabled = () => Boolean(process.env.TURNSTILE_SECRET);

/**
 * @param {string} token   what the widget put in the form
 * @param {string} [ip]    the visitor's address, for Cloudflare's own scoring
 * @returns {Promise<{ok:boolean, reason?:string, outage?:boolean}>}
 */
const verify = async (token, ip) => {
  if (!enabled()) return { ok: true };
  if (!token) return { ok: false, reason: 'missing-input-response' };
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: String(token) });
  if (ip) body.set('remoteip', ip);
  let res;
  try {
    res = await fetch(VERIFY, { method: 'POST', body, signal: AbortSignal.timeout(6000) });
  } catch (err) {
    return { ok: true, outage: true, reason: `siteverify unreachable: ${err.message}` };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: true, outage: true, reason: `siteverify said ${res.status}` };
  if (data.success) return { ok: true };
  return { ok: false, reason: (data['error-codes'] || ['unknown']).join(',') };
};

/** Express middleware: reads `turnstileToken` from the body. */
const requireTurnstile = async (req, res, next) => {
  try {
    const r = await verify(req.body?.turnstileToken, req.ip);
    if (r.outage) console.error('turnstile:', r.reason, '- letting the request through');
    if (!r.ok) {
      console.warn('turnstile refused', req.path, r.reason);
      return res.status(400).json({ message: 'The security check did not pass. Reload the page and try again.', code: 'turnstile' });
    }
    return next();
  } catch (err) {
    console.error('turnstile middleware failed:', err.message);
    return next();
  }
};

module.exports = { requireTurnstile, verify, enabled };
