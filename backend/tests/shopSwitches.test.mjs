/**
 * The admin's shop switches are enforced by the API, not only drawn on the
 * page (plan 2.16, 15 Sep 2026):
 *
 *   freeShippingAbove  a basket worth that much ships free, valued at the
 *                      price the customer pays (sale price while a sale runs),
 *                      before coupons; 0 means the rule is off
 *   sameDayEnabled     off = Borzo is neither quoted nor offered, even in Jaipur
 *
 * With no settings document (a fresh database, tests) both keep the code's
 * defaults, so a missing document never changes a price.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const shiprocket = require('../utils/shiprocketService');
const borzo = require('../utils/borzo');
const Seller = require('../models/Seller');
const settings = require('../utils/liveSettings');
const { calculateShipping, getDeliveryOptions, priceDeliveryOption, basketValue } = require('../utils/shipping');

const chainableQuery = (result) => ({
  select: () => chainableQuery(result),
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
});

const JAIPUR = { zipCode: '302017' };
const BENGALURU = { zipCode: '560038' };

const line = (price, quantity = 1, extra = {}) => ({ quantity, productId: { weight: 0.5, price, ...extra } });

let originals;
let live;

beforeEach(() => {
  originals = { getShippingRate: shiprocket.getShippingRate, quoteSameDay: borzo.quoteSameDay, liveSettings: settings.liveSettings, sellerFind: Seller.find };
  live = null;
  settings.liveSettings = vi.fn(async () => live);
  Seller.find = vi.fn(() => chainableQuery([]));
  shiprocket.getShippingRate = vi.fn(async () => ({ data: { available_courier_companies: [{ courier_name: 'Xpressbees', freight_charge: 71, cod_charges: 30 }] } }));
  borzo.quoteSameDay = vi.fn(async () => ({ provider: 'borzo', price: 102, arrivalBy: new Date(Date.now() + 2 * 3600000) }));
});

afterEach(() => {
  shiprocket.getShippingRate = originals.getShippingRate;
  borzo.quoteSameDay = originals.quoteSameDay;
  settings.liveSettings = originals.liveSettings;
  Seller.find = originals.sellerFind;
});

describe('free delivery above a basket value', () => {
  it('is off at 0 and when there is no settings document', async () => {
    expect((await calculateShipping([line(5000)], BENGALURU, false)).shippingCharges).toBe(71);
    live = { shop: { freeShippingAbove: 0 } };
    expect((await calculateShipping([line(5000)], BENGALURU, false)).shippingCharges).toBe(71);
  });

  it('ships free at or above the line, and charges just under it', async () => {
    live = { shop: { freeShippingAbove: 999 } };
    expect(await calculateShipping([line(999)], BENGALURU, false)).toMatchObject({ shippingCharges: 0, freeShipping: true, shippingCourier: 'Free delivery', freeAbove: 999 });
    expect(await calculateShipping([line(500, 2)], BENGALURU, true)).toMatchObject({ shippingCharges: 0, freeShipping: true });
    const under = await calculateShipping([line(998)], BENGALURU, false);
    expect(under).toMatchObject({ shippingCharges: 71, freeShipping: false });
    expect(shiprocket.getShippingRate).toHaveBeenCalledTimes(1);
  });

  it('values the basket at the sale price while a sale runs, and at the list price after it ends', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    expect(basketValue([line(1200, 1, { salePrice: 900, saleEndsAt: tomorrow })])).toBe(900);
    expect(basketValue([line(1200, 1, { salePrice: 900, saleEndsAt: yesterday })])).toBe(1200);
    expect(basketValue([line(300, 3), line(50)])).toBe(950);
  });

  it('is what the priced option carries to the order', async () => {
    live = { shop: { freeShippingAbove: 500 } };
    const priced = await priceDeliveryOption([line(600)], BENGALURU, false, 'standard');
    expect(priced).toMatchObject({ shippingCharges: 0, freeShipping: true, deliveryOption: 'standard' });
  });
});

describe('same-day switched off', () => {
  it('quotes and offers Borzo in Jaipur by default', async () => {
    const options = await getDeliveryOptions([line(500)], JAIPUR, false);
    expect(options.map((o) => o.id)).toEqual(['standard', 'same_day']);
    expect(borzo.quoteSameDay).toHaveBeenCalledTimes(1);
  });

  it('does not even ask Borzo when the admin has switched it off', async () => {
    live = { shop: { sameDayEnabled: false } };
    const options = await getDeliveryOptions([line(500)], JAIPUR, false);
    expect(options.map((o) => o.id)).toEqual(['standard']);
    expect(borzo.quoteSameDay).not.toHaveBeenCalled();
  });

  it('a request naming same_day while it is off is priced as standard', async () => {
    live = { shop: { sameDayEnabled: false } };
    const priced = await priceDeliveryOption([line(500)], JAIPUR, false, 'same_day');
    expect(priced).toMatchObject({ deliveryOption: 'standard', shippingProvider: 'shiprocket', shippingCharges: 71 });
  });
});
