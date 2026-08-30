/**
 * Delivery pricing - the single place shipping is calculated.
 *
 * Both checkout paths (COD in customerController, prepaid in
 * razorpayController) call this. They each used to carry their own copy of the
 * courier-selection logic, which is how the two ended up quoting differently
 * for the same basket.
 *
 * FREE SHIPPING
 *   A product can be marked `freeShipping`, meaning the seller absorbs the
 *   delivery cost. In a mixed basket only the items that are NOT free-shipping
 *   count towards the billable weight, so a free-shipping item genuinely rides
 *   along at the seller's expense rather than quietly making the rest dearer.
 *   If every item in the basket is free-shipping, delivery is zero and the
 *   courier is never called.
 */
const shiprocketService = require('./shiprocketService');

/**
 * Charged when the courier API cannot be reached.
 *
 * This used to be a flat Rs100, which was BELOW every real rate. Every order
 * that hit the fallback was under-charged and the platform silently absorbed
 * the difference - Rs70 on a ring, Rs234 on a showpiece, more than the whole
 * 8% commission on a Rs1600 sale.
 *
 * The bands below are the worst observed price across five destination zones
 * (Jaipur local, Delhi, Mumbai, Bengaluru, Guwahati), measured against the live
 * Shiprocket API on 2026-08-30 from pickup pincode 302019:
 *
 *     weight    cheapest .. worst
 *     0.5 kg    Rs71 .. Rs123
 *     1   kg    Rs113 .. Rs214
 *     2   kg    Rs128 .. Rs367
 *     3   kg    Rs131 .. Rs509
 *     5   kg    Rs200 .. Rs841
 *
 * Worst-case is deliberate: the fallback only fires when the courier API is
 * down, which is rare, and under-charging is a guaranteed loss on every such
 * order while over-charging is an occasional annoyance on a few. A local
 * Jaipur delivery during an outage will be quoted more than it costs.
 *
 * Above 5 kg the sample is thin and real rates were not monotonic, so the last
 * band is extrapolated. Re-measure before stocking genuinely heavy goods; the
 * catalogue's heaviest item today is 1.2 kg.
 */
const FALLBACK_BANDS = [
  { upToKg: 0.5, price: 125 },
  { upToKg: 1, price: 215 },
  { upToKg: 2, price: 370 },
  { upToKg: 3, price: 510 },
  { upToKg: 5, price: 845 },
];

/** Added per kilogram beyond the heaviest measured band. */
const FALLBACK_PER_EXTRA_KG = 50;

/** What to charge for `weightKg` when no live quote is available. */
const fallbackPrice = (weightKg) => {
  const band = FALLBACK_BANDS.find((b) => weightKg <= b.upToKg);
  if (band) return band.price;

  const heaviest = FALLBACK_BANDS[FALLBACK_BANDS.length - 1];
  const extraKg = Math.ceil(weightKg - heaviest.upToKg);
  return heaviest.price + extraKg * FALLBACK_PER_EXTRA_KG;
};

/** Assumed weight for a product that has none recorded. */
const DEFAULT_ITEM_WEIGHT = 0.5;

/** Reads the weight of one cart line, whether populated or plain. */
const weightOf = (item) => {
  const product = item.productId && item.productId.weight !== undefined ? item.productId : item;
  return (product.weight || DEFAULT_ITEM_WEIGHT) * (item.quantity || 1);
};

/** True when this line's product is flagged as free to deliver. */
const isFreeShipping = (item) => {
  const product = item.productId && typeof item.productId === 'object' ? item.productId : item;
  return product.freeShipping === true;
};

/**
 * Quotes delivery for a basket.
 *
 * @param {Array}  cartItems  cart lines, each with a populated productId
 * @param {object} address    delivery address, needs zipCode
 * @param {boolean} isCOD     true adds the courier's cash-handling fee
 * @returns {{shippingCharges: number, shippingCourier: string, freeShipping: boolean}}
 */
const calculateShipping = async (cartItems, address, isCOD) => {
  const billable = cartItems.filter((item) => !isFreeShipping(item));

  // Nothing to bill for: every item carries its own delivery.
  if (billable.length === 0) {
    return {
      shippingCharges: 0,
      shippingCourier: 'Free delivery',
      freeShipping: true,
    };
  }

  const totalWeight = billable.reduce((sum, item) => sum + weightOf(item), 0);

  try {
    const shippingData = await shiprocketService.getShippingRate(
      address.zipCode,
      totalWeight,
      isCOD
    );

    const couriers =
      (shippingData && shippingData.data && shippingData.data.available_courier_companies) ||
      (shippingData && shippingData.available_courier_companies) ||
      [];

    if (couriers.length === 0) {
      console.warn('Shiprocket: no couriers available - using the weight fallback');
      return {
        shippingCharges: fallbackPrice(totalWeight),
        shippingCourier: 'Standard Shipping',
        freeShipping: false,
      };
    }

    const rateOf = (c) => c.freight_charge || c.rate || c.total_charge || 0;
    const cheapest = couriers.reduce((min, curr) => (rateOf(curr) < rateOf(min) ? curr : min));

    const baseRate = rateOf(cheapest);
    const codFee = isCOD ? cheapest.cod_charges || cheapest.cod_charge || 0 : 0;

    return {
      shippingCharges: Math.round(baseRate + codFee),
      shippingCourier: cheapest.courier_name || cheapest.courier_company_id || 'Shiprocket',
      freeShipping: false,
    };
  } catch (err) {
    // Never block a checkout because the courier API is down; charge the
    // weight band instead, which is priced not to lose money.
    console.error('Shipping calculation failed:', err.message);
    return {
      shippingCharges: fallbackPrice(totalWeight),
      shippingCourier: 'Standard Shipping',
      freeShipping: false,
    };
  }
};

module.exports = {
  calculateShipping,
  isFreeShipping,
  fallbackPrice,
  FALLBACK_BANDS,
  DEFAULT_ITEM_WEIGHT,
};
