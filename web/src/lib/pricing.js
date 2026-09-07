/**
 * What a product actually costs right now, and what to show beside it.
 *
 * WHY THIS IS SHARED AND NOT INLINED
 *   Three surfaces show a price - the card, the product page, and the cart -
 *   and the backend charges a fourth. A shop where the card says one number and
 *   the checkout charges another is the drip-pricing complaint the CCPA fined
 *   FirstCry Rs 2 lakh over in September 2025. One function, so they cannot
 *   drift.
 *
 *   It mirrors backend/utils/discount.js deliberately: the server decides what
 *   is charged, this only decides what is displayed, and the two follow the
 *   same rule so they always agree.
 *
 * WHAT `was` IS FOR
 *   The struck-through number. It is the normal price during a sale, or the MRP
 *   where one is recorded and higher - never an invented figure. MRP is the
 *   legal maximum under the Legal Metrology rules, not a marketing anchor, and
 *   the server refuses a selling price above it.
 */
export const priceOf = (product, now = new Date()) => {
  const base = Number(product?.price) || 0;
  const sale = Number(product?.salePrice) || 0;
  const mrp = Number(product?.mrp) || 0;

  const inWindow = () => {
    const from = product.saleStartsAt ? new Date(product.saleStartsAt) : null;
    const until = product.saleEndsAt ? new Date(product.saleEndsAt) : null;
    if (from && now < from) return false;
    if (until && now > until) return false;
    return true;
  };

  const onSale = Boolean(sale) && sale < base && inWindow();
  const price = onSale ? sale : base;

  // During a sale the comparison is the normal price; otherwise it is the MRP,
  // and only when that is genuinely higher.
  const was = onSale ? base : mrp > base ? mrp : null;

  return {
    price,
    was,
    onSale,
    /** Whole percent, rounded down - never rounded up to flatter the offer. */
    percentOff: was && was > price ? Math.floor(((was - price) / was) * 100) : 0,
    /** True when `was` is a printed MRP rather than our own former price. */
    wasIsMrp: !onSale && Boolean(was),
  };
};
