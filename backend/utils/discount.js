const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Money when something is sold for less than its usual price.
 *
 * THE QUESTION EVERYTHING HERE ANSWERS
 *   A discount is somebody paying part of the bill for the customer. The whole
 *   design turns on WHO - and if that is not recorded on the order line, the
 *   payout is wrong and nobody finds out until a seller says they were paid
 *   less than they expected. That is the same mistake commission taught: money
 *   rules that are re-derived later drift, so they are snapshotted at the sale.
 *
 * THE TWO KINDS, AND WHY THEY ARE NOT THE SAME
 *   A SALE PRICE is the seller's own decision. They have chosen to sell at a
 *   lower price, so that lower price simply IS the price - it becomes
 *   item.price, commission is charged on it, and nothing else needs to know.
 *
 *   A PLATFORM COUPON is the platform buying the sale. The seller still sells
 *   at their price and is paid on their price; the platform hands the customer
 *   the difference out of its own commission. That can take the platform's net
 *   on a line NEGATIVE, and it should - a coupon that costs more than the
 *   commission it earns is a marketing spend, and one worth being able to see.
 *
 *   A SELLER COUPON is the seller buying the sale, and behaves like a sale
 *   price: their gross falls, and commission is charged on what is left.
 *
 * WHAT NEVER HAPPENS
 *   Delivery is never discounted by a coupon here. Free delivery is its own
 *   switch (Seller.offersFreeShipping, Product.freeShipping) because it is money
 *   owed to a courier, not margin - mixing the two is how a shop ends up paying
 *   a courier out of a discount it thought it was giving on goods.
 */

/**
 * Split one discounted line into what each party gets.
 *
 * @param {object} line
 * @param {number} line.price      unit price charged to the customer
 * @param {number} line.quantity
 * @param {number} line.rate       commission percentage for this seller
 * @param {number} [line.discount] rupees off this line, already apportioned
 * @param {'platform'|'seller'} [line.fundedBy]
 * @returns {{
 *   lineTotal: number, customerPays: number, discountAmount: number,
 *   discountFundedBy: string|null, commissionRate: number,
 *   commissionAmount: number, sellerEarning: number, platformNet: number
 * }}
 */
const splitDiscountedLine = ({
  price,
  quantity,
  rate,
  discount = 0,
  fundedBy = null,
}) => {
  const lineTotal = round2(price * quantity);

  // Never more than the line is worth. A coupon bigger than the basket would
  // otherwise pay the customer to shop here.
  const discountAmount = round2(Math.min(Math.max(discount, 0), lineTotal));
  const customerPays = round2(lineTotal - discountAmount);

  const safeRate = Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 100) : 0;

  /*
   * The seller's gross is what THEY sold at, which is only reduced when the
   * seller is the one funding the discount. A platform coupon does not make
   * the seller sell for less.
   */
  const sellerGross =
    fundedBy === 'platform' ? lineTotal : round2(lineTotal - discountAmount);

  const commissionAmount = round2((sellerGross * safeRate) / 100);

  return {
    lineTotal,
    customerPays,
    discountAmount,
    discountFundedBy: discountAmount > 0 ? fundedBy : null,
    commissionRate: safeRate,
    commissionAmount,
    // Subtract rather than recompute, so the two halves always add back to the
    // seller's gross however the rounding fell.
    sellerEarning: round2(sellerGross - commissionAmount),
    /*
     * What the platform is left with once the seller is paid. Deliberately
     * allowed to be negative: a platform-funded coupon worth more than the
     * commission it earns IS a loss on that line, and a number that refuses to
     * go below zero would hide exactly the spend worth watching.
     */
    platformNet: round2(customerPays - round2(sellerGross - commissionAmount)),
  };
};

/**
 * Spread one order-level discount across the lines it applies to.
 *
 * WHY BY VALUE AND NOT EQUALLY
 *   The apportioned amount decides how much commission each seller is charged
 *   and how much each is paid. Splitting a RS 100 coupon equally across a
 *   RS 2,000 necklace and a RS 50 nose pin would take RS 50 off a line worth
 *   RS 50 - the small seller funds almost the whole thing. By value, each line
 *   gives up the same proportion, which is the only split that is fair to
 *   sellers who did not choose the coupon.
 *
 * The rounding remainder goes to the LARGEST line, so the parts always add back
 * to the whole and the error lands where it is proportionally smallest.
 *
 * @param {Array} lines  [{ price, quantity }]
 * @param {number} total rupees to spread
 * @returns {number[]} rupees off each line, same order, summing to `total`
 */
const apportionDiscount = (lines, total) => {
  const values = lines.map((l) => round2(l.price * l.quantity));
  const sum = round2(values.reduce((a, b) => a + b, 0));

  if (sum <= 0 || total <= 0) return lines.map(() => 0);

  const capped = Math.min(total, sum);
  const shares = values.map((v) => round2((capped * v) / sum));

  // Put the rounding difference on the biggest line.
  const spread = round2(shares.reduce((a, b) => a + b, 0));
  const drift = round2(capped - spread);
  if (drift !== 0) {
    const biggest = values.indexOf(Math.max(...values));
    shares[biggest] = round2(shares[biggest] + drift);
  }

  return shares;
};

/**
 * The price a product is actually being sold at right now.
 *
 * A sale price only counts inside its window. Outside it the normal price
 * applies - which is what makes a scheduled sale end by itself rather than by
 * somebody remembering to switch it off.
 *
 * @param {object} product
 * @param {Date} [now]
 * @returns {{price: number, onSale: boolean, was: number|null}}
 */
const effectivePrice = (product, now = new Date()) => {
  const base = Number(product?.price) || 0;
  const sale = Number(product?.salePrice) || 0;

  if (!sale || sale >= base) return { price: base, onSale: false, was: null };

  const from = product.saleStartsAt ? new Date(product.saleStartsAt) : null;
  const until = product.saleEndsAt ? new Date(product.saleEndsAt) : null;

  if (from && now < from) return { price: base, onSale: false, was: null };
  if (until && now > until) return { price: base, onSale: false, was: null };

  return { price: sale, onSale: true, was: base };
};

module.exports = { splitDiscountedLine, apportionDiscount, effectivePrice, round2 };
