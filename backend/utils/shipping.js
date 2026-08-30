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

/** Charged when the courier API cannot be reached. See the note below. */
const FALLBACK_SHIPPING = 100;

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
      console.warn('Shiprocket: no couriers available - using fallback');
      return {
        shippingCharges: FALLBACK_SHIPPING,
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
    // Never block a checkout because the courier API is down.
    //
    // NOTE: the flat fallback is currently BELOW real rates (they start around
    // Rs170 and climb with weight), so every order that lands here is
    // under-charged and the platform absorbs the difference. Raising it to a
    // weight-based table is a pending business decision.
    console.error('Shipping calculation failed:', err.message);
    return {
      shippingCharges: FALLBACK_SHIPPING,
      shippingCourier: 'Standard Shipping',
      freeShipping: false,
    };
  }
};

module.exports = {
  calculateShipping,
  isFreeShipping,
  FALLBACK_SHIPPING,
  DEFAULT_ITEM_WEIGHT,
};
