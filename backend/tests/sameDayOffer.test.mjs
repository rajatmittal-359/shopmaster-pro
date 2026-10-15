/**
 * WHAT THE PRODUCT PAGE MAY PROMISE (15 Oct 2026)
 *
 * Same-day moved from the checkout to beside the price, because that is where
 * the decision is made. To keep it cheap it answered from four local gates and
 * never called Borzo - and one gate it did not have was "is Borzo in this city
 * at all?". `sameDayPickupFor` asks only for an address, a phone and a name, so
 * ANY seller anywhere in India with a filled pickup address was offered it.
 *
 * Found live on this box, with real Borzo calls:
 *   All in one, pickup 305601 Nasirabad → page said "a rider brings it today"
 *   Borzo, asked for 305601 and for Ajmer 305001 → null, both times.
 * A promise the courier had already refused.
 *
 * The other half, the same prefix seen from the other side:
 *   The house shop in Jaipur 302019 to Chomu 303702 → the page said no,
 *   because 302 !== 303. Borzo quoted it at Rs 445. A sale refused by a string
 *   comparison.
 *
 * So the first three PIN digits are wrong in BOTH directions, and the fix is
 * to stop guessing twice over:
 *   - distance, from the two points we already store and index, decides
 *     whether a rider is worth asking about at all (utils/geo);
 *   - BORZO decides whether it will carry it, and its answer is the coverage
 *     list - there is no city list to keep, and theirs cannot go stale.
 * Borzo answers from a bare PIN (302001 priced the same with and without the
 * city), which is all a product page has.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const settings = require('../utils/liveSettings');
const borzo = require('../utils/borzo');
const axios = require('axios');
const geo = require('../utils/geo');
const shiprocket = require('../utils/shiprocketService');
const { _clearCache } = require('../utils/deliveryEstimate');

const PRODUCT = new mongoose.Types.ObjectId();
const HOUSE = new mongoose.Types.ObjectId();
const AJMER = new mongoose.Types.ObjectId();

/** Charming Jewels: Jaipur, and the point the backfill found for it. */
const houseShop = {
  userId: HOUSE,
  isPlatformOwned: true,
  businessName: 'Charming Jewels',
  pickupAddress: { pincode: '302019', city: 'Jaipur', location: { type: 'Point', coordinates: [75.7619873, 26.8843006] } },
};

/** All in one: Nasirabad, 120km away, in a city Borzo does not serve. */
const ajmerShop = {
  userId: AJMER,
  isPlatformOwned: false,
  businessName: 'All in one',
  pickupAddress: {
    address1: 'Station Road',
    pincode: '305601',
    city: 'Nasirabad',
    state: 'Rajasthan',
    phone: '9876501234',
    location: { type: 'Point', coordinates: [74.7369464, 26.297039] },
  },
};

/** The real Nominatim answers for the PINs below, so no test touches the network. */
const POINTS = {
  302001: { lat: 26.9124, lng: 75.7873, precision: 'pincode', source: 'nominatim' },
  303702: { lat: 27.1667, lng: 75.7167, precision: 'pincode', source: 'nominatim' }, // Chomu, ~32km
  305601: { lat: 26.3074, lng: 74.7314, precision: 'pincode', source: 'nominatim' },
  110001: { lat: 28.6333, lng: 77.2167, precision: 'pincode', source: 'nominatim' }, // Delhi
};

const saved = {};
let quotes;
let refuse;
let throwOnce;

beforeEach(() => {
  saved.env = { ...process.env };
  process.env.SHIPROCKET_PICKUP_PINCODE = '302019';
  process.env.BORZO_API_TOKEN = 'test-token';
  process.env.BORZO_ENV = 'production';
  process.env.BORZO_PICKUP_ADDRESS = 'C-13 Hari Marg, Jaipur';
  process.env.BORZO_PICKUP_PHONE = '9000000000';

  saved.productFindOne = Product.findOne;
  saved.sellerFindOne = Seller.findOne;
  saved.live = settings.liveSettings;

  settings.liveSettings = vi.fn(async () => null);
  Product.findOne = vi.fn(() => chainableQuery({ _id: PRODUCT, processingDays: null, sellerId: HOUSE }));
  Seller.findOne = vi.fn(() => chainableQuery(houseShop));

  /*
   * Borzo is mocked at AXIOS, not at one of its own functions, so the real
   * `requestQuote` runs: its `is_successful` handling and its three-state
   * answer are the things under test here. A thrown request is "we could not
   * ask"; `is_successful: false` is "they said no" - and the difference is the
   * whole point, because only one of them may be remembered.
   */
  quotes = [];
  refuse = new Set(['110001']);
  throwOnce = false;
  vi.spyOn(axios, 'post').mockImplementation(async (url, body) => {
    const pin = String(body?.points?.[1]?.address || '');
    quotes.push(pin);
    if (throwOnce) {
      throwOnce = false;
      throw new Error('socket hang up');
    }
    if (refuse.has(pin)) return { data: { is_successful: false } };
    return {
      data: {
        is_successful: true,
        order: { payment_amount: 94, points: [{}, { required_finish_datetime: '2026-10-15T08:18:05Z' }] },
      },
    };
  });
  vi.spyOn(geo, 'geocodeAddress').mockImplementation(async (a) => POINTS[String(a?.pincode)] || null);

  vi.spyOn(shiprocket, 'getShippingRate').mockResolvedValue({ data: { available_courier_companies: [{ courier_name: 'X', rate: 60, estimated_delivery_days: '1' }] } });
  vi.spyOn(shiprocket, 'pickBestCourier').mockReturnValue({ courier_name: 'X', rate: 60, estimated_delivery_days: '1' });

  if (borzo._clearSameDayOffers) borzo._clearSameDayOffers();
  _clearCache();
});

afterEach(() => {
  Product.findOne = saved.productFindOne;
  Seller.findOne = saved.sellerFindOne;
  settings.liveSettings = saved.live;
  process.env = saved.env;
  vi.restoreAllMocks();
  _clearCache();
});

const ask = async (pincode) => {
  _clearCache();
  const res = await request(app).get(`/api/pincode/${pincode}/delivery?product=${PRODUCT}`);
  expect(res.status).toBe(200);
  return res.body;
};

describe('the page may not promise what the courier refuses', () => {
  it('does not offer same-day for a seller in a city Borzo does not serve', async () => {
    Product.findOne = vi.fn(() => chainableQuery({ _id: PRODUCT, processingDays: null, sellerId: AJMER }));
    Seller.findOne = vi.fn(() => chainableQuery(ajmerShop));
    refuse.add('305601'); // the live account's real answer for Nasirabad

    const body = await ask('305601');

    expect(body.serviceable).toBe(true);
    expect(body.sameDay).toBe(false);
  });

  it('offers same-day when Borzo says it will carry it', async () => {
    const body = await ask('302001');

    expect(body.sameDay).toBe(true);
  });

  it('asks the courier once per PIN and remembers the answer', async () => {
    await ask('302001');
    await ask('302001');

    expect(quotes.filter((p) => p === '302001')).toHaveLength(1);
  });
});

describe('distance, not the first three digits of a PIN', () => {
  it('offers the next town over, which Borzo quotes and the old prefix refused', async () => {
    // Chomu is 303702 against a 302019 pickup: a different prefix, 32km, and a
    // real Rs 445 quote on the live account.
    const body = await ask('303702');

    expect(body.sameDay).toBe(true);
  });

  it('never troubles the courier about another city', async () => {
    const body = await ask('110001');

    expect(body.sameDay).toBe(false);
    expect(quotes).not.toContain('110001');
  });

  it('keeps the old proxy when the address cannot be placed, rather than withdrawing the offer', async () => {
    geo.geocodeAddress.mockResolvedValue(null);

    const body = await ask('302001');

    expect(body.sameDay).toBe(true);
  });
});

describe('a courier we could not reach is not a courier that said no', () => {
  it('shows nothing this time, and does not remember it as a refusal', async () => {
    throwOnce = true;

    // Borzo was down for that one question, so the page stays quiet.
    expect((await ask('302001')).sameDay).toBe(false);

    // It is back, and the offer returns at once rather than in six hours.
    expect((await ask('302001')).sameDay).toBe(true);
    expect(quotes.filter((p) => p === '302001')).toHaveLength(2);
  });
});
