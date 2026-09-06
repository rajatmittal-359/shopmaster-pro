const { apportionDiscount, round2 } = require('./discount');

/**
 * Deciding whether a code applies, and what it is worth.
 *
 * WHY EVERY REFUSAL HAS ITS OWN SENTENCE
 *   "Invalid coupon" is the worst message in retail. It means seven different
 *   things - expired, used up, wrong basket, not your seller's, too small an
 *   order - and the customer cannot tell which, so they either give up or write
 *   in. Each reason below says the actual thing, because a customer who is
 *   RS 200 short of the minimum will happily add RS 200 of jewellery if told.
 *
 * WHY THE COUNT IS NOT TOUCHED HERE
 *   This only ever reads. A code is counted as used when the order is PAID FOR,
 *   not when it is typed - otherwise a campaign runs out because people looked
 *   at it, and an abandoned basket costs a real customer their discount.
 */

/** Lines a given coupon is allowed to touch. */
const eligibleLines = (coupon, lines) =>
  coupon.fundedBy === 'seller'
    ? lines.filter((l) => String(l.sellerId) === String(coupon.sellerId))
    : lines;

/**
 * @param {object} coupon   a Coupon document
 * @param {object} ctx
 * @param {Array}  ctx.lines     [{ productId, sellerId, price, quantity }]
 * @param {string} ctx.customerId
 * @param {Date}   [ctx.now]
 * @returns {{ok: true, discount: number, perLine: number[], appliesTo: Array}
 *          |{ok: false, reason: string}}
 */
const evaluateCoupon = (coupon, { lines = [], customerId, now = new Date() }) => {
  if (!coupon) {
    return { ok: false, reason: 'We do not have a code by that name.' };
  }
  if (!coupon.isActive) {
    return { ok: false, reason: 'That code is no longer being offered.' };
  }

  if (coupon.validFrom && now < new Date(coupon.validFrom)) {
    const from = new Date(coupon.validFrom).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
    });
    return { ok: false, reason: `That code starts on ${from}.` };
  }
  if (coupon.validUntil && now > new Date(coupon.validUntil)) {
    return { ok: false, reason: 'That code has expired.' };
  }

  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: 'That code has been fully claimed.' };
  }

  if (customerId && coupon.perCustomerLimit != null) {
    const mine = (coupon.usedBy || []).find(
      (u) => String(u.customerId) === String(customerId)
    );
    if (mine && mine.count >= coupon.perCustomerLimit) {
      return {
        ok: false,
        reason:
          coupon.perCustomerLimit === 1
            ? 'You have already used that code.'
            : `You have used that code ${coupon.perCustomerLimit} times already.`,
      };
    }
  }

  const applicable = eligibleLines(coupon, lines);
  if (!applicable.length) {
    return {
      ok: false,
      reason: 'That code does not apply to anything in your basket.',
    };
  }

  /*
   * The minimum is measured against the lines the code can actually touch, not
   * the whole basket. Otherwise a seller's own RS 500-minimum code could be
   * unlocked by buying RS 500 of somebody else's goods - the seller would fund
   * a discount on a basket that never met their condition.
   */
  const eligibleValue = round2(
    applicable.reduce((sum, l) => sum + l.price * l.quantity, 0)
  );

  if (coupon.minOrderValue && eligibleValue < coupon.minOrderValue) {
    const short = round2(coupon.minOrderValue - eligibleValue);
    return {
      ok: false,
      // The number that lets a customer act on it, rather than just be refused.
      reason: `That code needs ₹${coupon.minOrderValue} of eligible items. You are ₹${short} short.`,
    };
  }

  let discount =
    coupon.type === 'percent'
      ? round2((eligibleValue * coupon.value) / 100)
      : round2(coupon.value);

  // A percentage without a ceiling is an unbounded cost on a large basket.
  if (coupon.type === 'percent' && coupon.maxDiscount != null) {
    discount = Math.min(discount, coupon.maxDiscount);
  }

  // Never more than the goods it applies to are worth.
  discount = round2(Math.min(discount, eligibleValue));

  if (discount <= 0) {
    return { ok: false, reason: 'That code is worth nothing on this basket.' };
  }

  /*
   * Spread across the eligible lines by value. This is not cosmetic: the
   * per-line amount decides how much commission each seller is charged and how
   * much each is paid - see utils/discount.js.
   */
  const shares = apportionDiscount(applicable, discount);

  // Back onto the full basket, so the caller can zip it against their lines.
  const byLine = lines.map((line) => {
    const i = applicable.indexOf(line);
    return i === -1 ? 0 : shares[i];
  });

  return {
    ok: true,
    discount,
    perLine: byLine,
    fundedBy: coupon.fundedBy,
    code: coupon.code,
    description: coupon.description || null,
  };
};

module.exports = { evaluateCoupon, eligibleLines };
