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
const borzo = require('./borzo');

/**
 * Charged when the courier API cannot be reached.
 *
 * This used to be a flat Rs100, which was BELOW every out-of-town rate. Every
 * order that hit the fallback was under-charged and the platform absorbed the
 * difference - Rs70 on a ring to Bengaluru, Rs234 on a showpiece to Mumbai.
 *
 * But a flat rate was wrong in the other direction too. Delivering inside
 * Jaipur, where the shop is, costs roughly half what the same parcel costs
 * across the country. The delivery pincode is still known when the courier API
 * is down, so the fallback uses it: same-city parcels get the local band.
 *
 * Measured against the live Shiprocket API on 2026-08-30, pickup 302019,
 * cheapest courier per destination:
 *
 *              Jaipur (local)   worst of Delhi/Mumbai/Bengaluru/Guwahati
 *     0.5 kg   Rs71             Rs123
 *     1   kg   Rs113            Rs214
 *     2   kg   Rs128            Rs367
 *     3   kg   Rs131            Rs509
 *     5   kg   Rs200            Rs841
 *
 * Each band sits just above the worst price observed for it, because the
 * fallback only fires during an outage: under-charging is a guaranteed loss on
 * every such order, while over-charging is an occasional annoyance on a few.
 *
 * Above 5 kg the sample is thin and real rates were not monotonic, so the last
 * band is extrapolated. Re-measure before stocking genuinely heavy goods; the
 * catalogue's heaviest item today is 1.2 kg.
 */
const FALLBACK_BANDS = {
  local: [
    { upToKg: 0.5, price: 80 },
    { upToKg: 1, price: 125 },
    { upToKg: 2, price: 140 },
    { upToKg: 3, price: 150 },
    { upToKg: 5, price: 220 },
  ],
  national: [
    { upToKg: 0.5, price: 125 },
    { upToKg: 1, price: 215 },
    { upToKg: 2, price: 370 },
    { upToKg: 3, price: 510 },
    { upToKg: 5, price: 845 },
  ],
};

/** Added per kilogram beyond the heaviest measured band. */
const FALLBACK_PER_EXTRA_KG = { local: 25, national: 50 };

/**
 * Same city as the pickup warehouse.
 *
 * The first three digits of an Indian PIN identify the sorting district, so
 * sharing them with the pickup pincode is a good proxy for "local" without
 * hard-coding a list of Jaipur pincodes.
 */
const isLocalDelivery = (deliveryPincode) => {
  const pickup = String(process.env.SHIPROCKET_PICKUP_PINCODE || '');
  const delivery = String(deliveryPincode || '');
  if (pickup.length < 3 || delivery.length < 3) return false;
  return pickup.slice(0, 3) === delivery.slice(0, 3);
};

/** What to charge for `weightKg` to `deliveryPincode` when no quote is available. */
const fallbackPrice = (weightKg, deliveryPincode) => {
  const zone = isLocalDelivery(deliveryPincode) ? 'local' : 'national';
  const bands = FALLBACK_BANDS[zone];

  const band = bands.find((b) => weightKg <= b.upToKg);
  if (band) return band.price;

  const heaviest = bands[bands.length - 1];
  const extraKg = Math.ceil(weightKg - heaviest.upToKg);
  return heaviest.price + extraKg * FALLBACK_PER_EXTRA_KG[zone];
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
        shippingCharges: fallbackPrice(totalWeight, address.zipCode),
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
      shippingCharges: fallbackPrice(totalWeight, address.zipCode),
      shippingCourier: 'Standard Shipping',
      freeShipping: false,
    };
  }
};

/**
 * Every way this basket can be delivered to this address.
 *
 * Standard always appears. Same-day appears only when the address is in the
 * same city AND Borzo will actually take it - it prices by distance and
 * declines addresses it cannot reach, so the offer is never a guess.
 *
 * A free-shipping basket stays free on standard delivery, but same-day is a
 * genuine extra cost the seller did not promise to absorb, so it is charged.
 *
 * @returns {Array<{id, label, price, courier, etaText, arrivalBy}>}
 */
const getDeliveryOptions = async (cartItems, address, isCOD) => {
  const standard = await calculateShipping(cartItems, address, isCOD);

  const options = [
    {
      id: 'standard',
      label: 'Standard Delivery',
      price: standard.shippingCharges,
      courier: standard.shippingCourier,
      etaText: standard.freeShipping ? 'Free delivery, 2-3 days' : '2-3 days',
      arrivalBy: null,
    },
  ];

  // Skip the network call entirely for out-of-town addresses.
  if (!isLocalDelivery(address.zipCode)) return options;

  const billableWeight = cartItems.reduce((sum, item) => sum + weightOf(item), 0);
  const sameDay = await borzo.quoteSameDay(address, billableWeight);
  if (!sameDay) return options;

  options.push({
    id: 'same_day',
    label: 'Same-day Delivery',
    price: sameDay.price,
    courier: 'Borzo',
    etaText: sameDay.arrivalBy
      ? `Today by ${sameDay.arrivalBy.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : 'Today',
    arrivalBy: sameDay.arrivalBy,
  });

  return options;
};

/**
 * Prices ONE chosen option, re-quoting rather than trusting the client.
 *
 * The browser sends back an option id, never a price. A customer who edits the
 * amount in the request must not be able to choose what they pay for delivery.
 */
const priceDeliveryOption = async (cartItems, address, isCOD, optionId) => {
  const options = await getDeliveryOptions(cartItems, address, isCOD);
  const chosen = options.find((o) => o.id === optionId) || options[0];

  return {
    shippingCharges: chosen.price,
    shippingCourier: chosen.courier,
    shippingProvider: chosen.id === 'same_day' ? 'borzo' : 'shiprocket',
    freeShipping: chosen.id === 'standard' && chosen.price === 0,
    deliveryOption: chosen.id,
    arrivalBy: chosen.arrivalBy || null,
  };
};

module.exports = {
  getDeliveryOptions,
  priceDeliveryOption,
  calculateShipping,
  isFreeShipping,
  fallbackPrice,
  FALLBACK_BANDS,
  isLocalDelivery,
  DEFAULT_ITEM_WEIGHT,
};
