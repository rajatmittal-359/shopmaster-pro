/**
 * Available-to-promise: what this product can actually be sold, right now.
 *
 * WHY IT IS HERE AND NOT IN A COMPONENT
 *   `Math.max(0, stock - reserved)` was written out by hand in five places in
 *   `web/` and nowhere on the server. On 30 Sep 2026 that cost a live bug: the
 *   shop page's query selected neither field, every card computed 0, and seven
 *   products holding two units each showed "Out of stock" with no buy buttons
 *   for eight days. Nothing threw - a missing field is `undefined`, and
 *   `undefined || 0` is 0 - and no test went red, because none asked.
 *
 *   This project already learned that lesson three times and wrote it down:
 *   the price comes from one function (`utils/discount` ↔ `lib/pricing`,
 *   "so they cannot drift"), an order's words come only from
 *   `lib/orderStatus`, and a delivery date is never computed in a component.
 *   Availability is the fourth, and it is the one that was left out.
 *
 * THE TRADE CALLS THIS ATP
 *   On hand minus what is already committed. Shopify's Storefront API sends
 *   the answer - `availableForSale`, `quantityAvailable` - and never the raw
 *   inputs, precisely so a client cannot arrive at a different number from the
 *   server. This is our smaller version of the same rule.
 *
 * WHY IT MATTERS BEYOND TIDINESS
 *   The number is a promise to a shopper, and under the CCPA's dark-pattern
 *   guidelines (2023) understating stock is "false urgency" with the burden of
 *   proof on us. A promise made by whichever component happened to be handed
 *   the right two fields is not one we can stand behind.
 *
 * `reserved` IS NOT A CART
 *   It is units held for unpaid prepaid checkouts, released when one expires
 *   (models/Product, utils/reservation). Subtracting it is correct; subtracting
 *   carts would not be, and we do not.
 */

/**
 * Used only when a product carries no threshold of its own. It matches the
 * `lowStockThreshold` default on the Product model on purpose - the code had
 * three different fallbacks (10 on the model, 3 on the product page, 10 on the
 * seller table), which is the same drift in miniature.
 */
const LOW_STOCK_DEFAULT = 10;

/**
 * @param {{stock?: number, reserved?: number, lowStockThreshold?: number}} product
 * @returns {{available: number, state: 'out'|'low'|'in', inStock: boolean}}
 */
/**
 * The seller's own number, with 0 kept as an answer rather than read as
 * absence. Exported because the seller panel and the admin's low-stock list
 * have to agree with the badge a shopper's card draws.
 */
const thresholdOf = (product) => {
  const raw = product?.lowStockThreshold;
  if (raw === null || raw === undefined || raw === '') return LOW_STOCK_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : LOW_STOCK_DEFAULT;
};

const availabilityOf = (product) => {
  const stock = Number(product?.stock) || 0;
  const reserved = Number(product?.reserved) || 0;
  const available = Math.max(0, stock - reserved);

  // The threshold counts against what can be promised, not what is on the
  // shelf: 12 on hand with 10 held is a shop with two to sell.
  //
  // ZERO MEANS NEVER, AND ZERO IS NOT MISSING
  //   A seller who stocks one of everything wants no warning at all, and the
  //   threshold already has an off switch: nothing with stock can sit at or
  //   below zero. But `Number(0) || 10` is 10, which is the same falsy
  //   coercion that made the shop page call a full shop empty - so a
  //   deliberate 0 and a field nobody filled have to be told apart here
  //   rather than collapsed.
  const threshold = thresholdOf(product);

  // A word, never a colour or a bare number - the checklist's P1 rule, and
  // the thing that lets a card say "2 left" and a feed say "in stock" from
  // the same source.
  // Out is a fact and is always said. Low is a warning, and a threshold of 0
  // is the seller saying they do not want one.
  const state = available === 0 ? 'out' : threshold > 0 && available <= threshold ? 'low' : 'in';

  return { available, state, inStock: available > 0 };
};

/**
 * The same answer attached to a list on its way out of an endpoint.
 *
 * Deliberately NOT folded into `withShop`: that helper puts a shop's name on a
 * product, and a storefront list wanting both is not a reason to make one of
 * them quietly do the other's job. Callers say what they are attaching.
 */
const withAvailability = (products) =>
  (products || []).map((product) => ({ ...product, availability: availabilityOf(product) }));

module.exports = { availabilityOf, withAvailability, thresholdOf, LOW_STOCK_DEFAULT };
