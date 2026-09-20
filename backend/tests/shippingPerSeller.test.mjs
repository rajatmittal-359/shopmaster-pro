/**
 * Shipping is quoted from each seller's OWN pickup pincode (2.54, 21 Sep 2026).
 *
 * Found on the first outside seller's checkout: a Nasirabad buyer of a
 * Nasirabad seller's parcel was quoted Jaipur→Nasirabad, because the rate call
 * always used the house shop's pincode. Booking already went per seller; the
 * quote did not. Now: one rate call per seller in the basket, from their
 * pickup pincode (the house shop keeps the env default), summed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const shiprocket = require('../utils/shiprocketService');
const settings = require('../utils/liveSettings');
const { calculateShipping } = require('../utils/shipping');

const HOUSE = new mongoose.Types.ObjectId();
const RAHUL = new mongoose.Types.ObjectId();
const address = { zipCode: '305601' };
const line = (sellerId, weight, price = 500) => ({ productId: { _id: new mongoose.Types.ObjectId(), sellerId, weight, price, isActive: true }, quantity: 1 });

const originals = {};
let calls;

beforeEach(() => {
  process.env.SHIPROCKET_PICKUP_PINCODE = '302019';
  originals.find = Seller.find;
  originals.rate = shiprocket.getShippingRate;
  originals.live = settings.liveSettings;
  settings.liveSettings = vi.fn(async () => null);
  calls = [];
  Seller.find = vi.fn((filter) => {
    // Two lookups share the model: free-shipping sellers (none here) and pickup pincodes.
    if (filter && filter.offersFreeShipping) return chainableQuery([]);
    return chainableQuery([
      { userId: HOUSE, isPlatformOwned: true, pickupAddress: { pincode: '302019' } },
      { userId: RAHUL, isPlatformOwned: false, pickupAddress: { pincode: '305601' } },
    ]);
  });
  shiprocket.getShippingRate = vi.fn(async (delivery, weight, cod, opts = {}) => {
    calls.push({ from: opts.pickupPincode || process.env.SHIPROCKET_PICKUP_PINCODE, delivery, weight });
    const local = (opts.pickupPincode || '302019') === delivery;
    return { data: { available_courier_companies: [{ courier_name: local ? 'Local Surface' : 'Xpressbees Surface', freight_charge: local ? 60 : 200, cod_charges: 0 }] } };
  });
});
afterEach(() => {
  Seller.find = originals.find;
  shiprocket.getShippingRate = originals.rate;
  settings.liveSettings = originals.live;
});

describe('calculateShipping quotes from the seller who ships', () => {
  it("an outside seller's parcel is quoted from THEIR pincode", async () => {
    const r = await calculateShipping([line(RAHUL, 5)], address, false);
    expect(calls).toEqual([{ from: '305601', delivery: '305601', weight: 5 }]);
    expect(r.shippingCharges).toBe(60);
    expect(r.shippingCourier).toBe('Local Surface');
  });

  it('the house shop keeps the env pincode', async () => {
    await calculateShipping([line(HOUSE, 0.5)], address, false);
    expect(calls).toEqual([{ from: '302019', delivery: '305601', weight: 0.5 }]);
  });

  it('two sellers in one basket = two quotes, summed, the weights kept apart', async () => {
    const r = await calculateShipping([line(HOUSE, 0.5), line(RAHUL, 5)], address, false);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.from).sort()).toEqual(['302019', '305601']);
    expect(r.shippingCharges).toBe(260);
    expect(r.shippingCourier).toMatch(/2 parcels/);
  });

  it('a seller with no pickup pincode on file falls back to the env pincode', async () => {
    const ORPHAN = new mongoose.Types.ObjectId();
    await calculateShipping([line(ORPHAN, 1)], address, false);
    expect(calls[0].from).toBe('302019');
  });
});
