/**
 * Sending money back.
 *
 * WHY THIS IS ITS OWN MODULE
 *   It used to be a `require('razorpay')` and a `new Razorpay(...)` inside the
 *   cancel function. That is unreachable from a test: the client is built at
 *   call time, so there is nothing to stand in front of, and the only way to
 *   exercise a cancellation was to really call Razorpay.
 *
 *   A refund is the single most expensive thing to get wrong here, so it has to
 *   be the easiest thing to test. As a module boundary it can be replaced the
 *   same way every other boundary in this codebase is.
 */
const Razorpay = require('razorpay');

/**
 * @param {string} paymentId  the gateway's payment id
 * @param {number} amount     in RUPEES; converted to paise here so no caller
 *                            has to remember the unit
 * @returns {Promise<{id: string}>}
 */
exports.refundPayment = async (paymentId, amount) => {
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  return razorpay.payments.refund(paymentId, {
    amount: Math.round(amount * 100),
    speed: 'normal',
  });
};
