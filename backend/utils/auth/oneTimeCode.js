/**
 * One-time codes by email, for a named purpose (19 Sep 2026).
 *
 * WHERE THEY ARE USED
 *   - a seller or admin signing in from a device this account has not used
 *     in 90 days (the money roles get a second step; a customer gets a mail)
 *   - step-up for an account that has no password (Google sign-in only)
 *   - changing the account email: the code goes to the NEW address, so the
 *     address is proven before it becomes the sign-in
 *
 * WHY EMAIL AND NOT SMS
 *   SMS costs money per message (MSG91/Twilio); the accounts already have a
 *   verified email and Brevo sends 300 a day free. WhatsApp OTP comes with
 *   the Meta channel later, for the same reason.
 *
 * HOW
 *   Six digits, ten minutes, stored on the user as a SHA-256 with the
 *   purpose and (for email change) the target address - the registration
 *   OTP kept its code in plain text under select:false; this one does not.
 *   Five wrong tries burn the code. Sixty seconds between sends. Compared
 *   in constant time.
 */
const crypto = require('crypto');
const sendEmail = require('../sendEmail');

const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_TRIES = 5;

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const equal = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const SUBJECT = {
  login: 'ShopMaster Pro - your sign-in code',
  stepup: 'ShopMaster Pro - confirm it is you',
  email_change: 'ShopMaster Pro - confirm your new email',
};
const LINE = {
  login: 'A sign-in from a new device needs this code',
  stepup: 'Changing money or account details needs this code',
  email_change: 'To make this address your sign-in, enter this code',
};

/**
 * Make a code, store its hash on the user, mail it.
 * @returns {Promise<{ok:true}|{ok:false,reason:string,retryInSeconds?:number}>}
 */
const sendCode = async (user, purpose, { to, mailer = sendEmail } = {}) => {
  if (!SUBJECT[purpose]) throw new Error(`unknown code purpose ${purpose}`);
  if (user.oneTimeCode?.sentAt && Date.now() - new Date(user.oneTimeCode.sentAt).getTime() < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(user.oneTimeCode.sentAt).getTime())) / 1000);
    return { ok: false, reason: `A code was sent a moment ago - wait ${wait} seconds`, retryInSeconds: wait };
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  const address = to || user.email;
  try {
    await mailer({
      to: address,
      subject: SUBJECT[purpose],
      text: `${LINE[purpose]}: ${code}\n\nIt works for 10 minutes. If you did not ask for it, ignore this mail - nothing changes without the code.`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937"><p>${LINE[purpose]}:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:8px 0">${code}</p><p style="color:#6b7280;font-size:14px">It works for 10 minutes. If you did not ask for it, ignore this mail - nothing changes without the code.</p></div>`,
    });
  } catch (err) {
    return { ok: false, reason: `The code could not be sent: ${err.message}` };
  }
  user.oneTimeCode = { hash: sha(code), purpose, target: address, expiresAt: new Date(Date.now() + TTL_MS), sentAt: new Date(), tries: 0 };
  await user.save();
  return { ok: true, to: address };
};

/**
 * Check a code for a purpose. Clears it on success or after five misses.
 * @returns {Promise<{ok:true,target:string}|{ok:false,reason:string}>}
 */
const checkCode = async (user, purpose, code) => {
  const c = user.oneTimeCode;
  if (!c || !c.hash || c.purpose !== purpose) return { ok: false, reason: 'No code was sent for this - ask for one' };
  if (new Date(c.expiresAt) < new Date()) return { ok: false, reason: 'That code has expired - ask for a new one' };
  if (!equal(sha(String(code || '')), c.hash)) {
    user.oneTimeCode.tries = (c.tries || 0) + 1;
    if (user.oneTimeCode.tries >= MAX_TRIES) user.oneTimeCode = undefined;
    await user.save();
    return { ok: false, reason: user.oneTimeCode ? 'That code is not right' : 'Too many wrong tries - ask for a new code' };
  }
  const target = c.target;
  user.oneTimeCode = undefined;
  await user.save();
  return { ok: true, target };
};

module.exports = { sendCode, checkCode, TTL_MS, COOLDOWN_MS, MAX_TRIES };
