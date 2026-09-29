/**
 * What a product can actually be sold, read from one place.
 *
 * WHY THIS EXISTS
 *   `Math.max(0, (x.stock || 0) - (x.reserved || 0))` was written out by hand
 *   in five components - the card, the product page, the cart, the size picker
 *   and the seller's product table. On 30 Sep 2026 that cost a live bug: the
 *   shop page's query asked the database for neither field, so every card read
 *   0, and seven products holding two units each said "Out of stock" with no
 *   buy buttons for eight days. Nothing threw, because a missing field is
 *   `undefined` and `undefined || 0` is 0.
 *
 *   This mirrors `backend/utils/availability.js` deliberately, the same way
 *   `lib/pricing` mirrors `utils/discount`: the server decides what may be
 *   sold, this only decides what is shown, and the two follow one rule so they
 *   cannot disagree.
 *
 * PREFER THE SERVER'S ANSWER
 *   Endpoints that have been taught to send `availability` are believed. The
 *   local sum is the fallback for the ones that have not, and it is now the
 *   ONLY place in this app where the subtraction is written - so a query that
 *   forgets a field is a bug in one known spot rather than a silent zero in
 *   five.
 *
 * `reserved` IS NOT A CART
 *   It counts units held for unpaid prepaid checkouts, released when one
 *   expires. Subtracting it is right; subtracting carts would not be.
 */

/** Matches LOW_STOCK_DEFAULT in backend/utils/availability.js and the model. */
export const LOW_STOCK_DEFAULT = 10;

export const availabilityOf = (product) => {
  const sent = product?.availability;
  if (sent && typeof sent.available === 'number') return sent;

  const stock = Number(product?.stock) || 0;
  const reserved = Number(product?.reserved) || 0;
  const available = Math.max(0, stock - reserved);
  const threshold = Number(product?.lowStockThreshold) || LOW_STOCK_DEFAULT;

  return {
    available,
    state: available === 0 ? 'out' : available <= threshold ? 'low' : 'in',
    inStock: available > 0,
  };
};

/** The number alone, for the many places that only need to count. */
export const availableOf = (product) => availabilityOf(product).available;
