/**
 * Ready-to-ship days per product (19 Sep 2026): the rulebook's number unless
 * the seller said otherwise; the promise is frozen on the order line; the
 * seller's dispatch-by date is the longest of their lines in working days;
 * the checkout's standard ETA stretches with it and same-day disappears;
 * the late clock grades against the order's own date.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const rules = require('../config/sellerRules');
const dispatch = require('../utils/dispatch');
const { estimateDelivery, _clearCache } = require('../utils/deliveryEstimate');
const shiprocket = require('../utils/shiprocketService');
const { computePerformance: sellerPerformance } = require('../utils/performance');

afterEach(() => vi.restoreAllMocks());

describe('the number', () => {
  it('cleans what the seller typed: empty/default → null, 1-30 whole days, anything else refused', () => {
    expect(dispatch.cleanProcessingDays('')).toEqual({ value: null });
    expect(dispatch.cleanProcessingDays('default')).toEqual({ value: null });
    expect(dispatch.cleanProcessingDays(7)).toEqual({ value: 7 });
    expect(dispatch.cleanProcessingDays('10')).toEqual({ value: 10 });
    expect(dispatch.cleanProcessingDays(0).error).toMatch(/1 to 30/);
    expect(dispatch.cleanProcessingDays(31).error).toMatch(/1 to 30/);
    expect(dispatch.cleanProcessingDays(2.5).error).toMatch(/whole number/);
  });
  it('a product without one uses the rulebook; made-to-order means longer than the rulebook', () => {
    expect(dispatch.processingDaysOf({})).toBe(rules.dispatchDays);
    expect(dispatch.processingDaysOf({ processingDays: 7 })).toBe(7);
    expect(dispatch.isMadeToOrder({ processingDays: 7 })).toBe(true);
    expect(dispatch.isMadeToOrder({ processingDays: rules.dispatchDays })).toBe(false);
    expect(dispatch.isMadeToOrder({})).toBe(false);
  });
});

describe('the date', () => {
  it('is the longest line, in working days from the order, Sundays skipped', () => {
    // Friday 20 Nov 2026 + 7 working days → Sunday 22 and Sunday 29 skipped → Sat 28 Nov
    const placed = new Date('2026-11-20T10:00:00Z');
    const lines = [{ processingDays: null, productId: {} }, { processingDays: 7 }, { productId: { processingDays: 3 } }];
    expect(dispatch.leadDaysOf(lines)).toBe(7);
    expect(dispatch.dispatchByFor(lines, placed).toISOString().slice(0, 10)).toBe('2026-11-28');
    // Nothing said anywhere: the rulebook's 2 working days.
    expect(dispatch.dispatchByFor([{ productId: {} }], placed).toISOString().slice(0, 10)).toBe('2026-11-23');
  });
});

describe('the product page estimate', () => {
  it('adds the product\'s own days to the courier\'s transit', async () => {
    _clearCache();
    vi.spyOn(shiprocket, 'getShippingRate').mockResolvedValue({ data: { available_courier_companies: [{ courier_name: 'X', rate: 60, estimated_delivery_days: '2' }] } });
    vi.spyOn(shiprocket, 'pickBestCourier').mockReturnValue({ courier_name: 'X', rate: 60, estimated_delivery_days: '2' });
    const now = new Date('2026-11-20T10:00:00Z'); // Friday
    const plain = await estimateDelivery('302001', { now });
    const made = await estimateDelivery('302001', { now, dispatchDays: 7 });
    expect(plain).toMatchObject({ serviceable: true, dispatchDays: 2, deliveryBy: '2026-11-25' });
    expect(made).toMatchObject({ serviceable: true, dispatchDays: 7, deliveryBy: '2026-12-01' });
    _clearCache();
  });
});

/*
 * ONE LINE, DRAWN IN ONE PLACE (15 Oct 2026)
 *
 * `isMadeToOrder` says "longer than the rulebook" and is tested above - but
 * nothing in the app called it. The checkout had the rule right by hand
 * (`extra = lead - defaultDays()`, same-day dies when extra > 0, shipping.js
 * 384-434); the product page's endpoint had its own copy that read
 * `processingDays > 0`. So a seller who typed the standard number into the
 * box got "no same-day" on the product page and same-day at the checkout -
 * the page refusing what the till would have sold.
 */
describe('the product page and the checkout draw the line in the same place', () => {
  const mongoose = require('mongoose');
  const requestLib = require('supertest');
  const app = require('../app');
  const Product = require('../models/Product');
  const Seller = require('../models/Seller');
  const settings = require('../utils/liveSettings');

  const HOUSE = new mongoose.Types.ObjectId();
  const PRODUCT = new mongoose.Types.ObjectId();
  const saved = {};

  const ask = async (processingDays) => {
    _clearCache();
    Product.findOne = vi.fn(() => chainableQuery({ _id: PRODUCT, processingDays, sellerId: HOUSE }));
    const res = await requestLib(app).get(`/api/pincode/302001/delivery?product=${PRODUCT}`);
    expect(res.status).toBe(200);
    return res.body;
  };

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

    Seller.findOne = vi.fn(() => chainableQuery({ userId: HOUSE, isPlatformOwned: true, pickupAddress: { pincode: '302019' } }));
    settings.liveSettings = vi.fn(async () => null);
    vi.spyOn(shiprocket, 'getShippingRate').mockResolvedValue({ data: { available_courier_companies: [{ courier_name: 'X', rate: 60, estimated_delivery_days: '1' }] } });
    vi.spyOn(shiprocket, 'pickBestCourier').mockReturnValue({ courier_name: 'X', rate: 60, estimated_delivery_days: '1' });
  });

  afterEach(() => {
    Product.findOne = saved.productFindOne;
    Seller.findOne = saved.sellerFindOne;
    settings.liveSettings = saved.live;
    process.env = saved.env;
    _clearCache();
  });

  it('offers same-day when the seller typed the rulebook\'s own number - the checkout would', async () => {
    // The checkout's rule, for the same product: extra is 0, so same-day lives.
    const extra = Math.max(0, dispatch.leadDaysOf([{ processingDays: rules.dispatchDays }]) - dispatch.defaultDays());
    expect(extra).toBe(0);
    expect(dispatch.isMadeToOrder({ processingDays: rules.dispatchDays })).toBe(false);

    const body = await ask(rules.dispatchDays);
    expect(body).toMatchObject({ serviceable: true, dispatchDays: rules.dispatchDays, sameDay: true });
  });

  it('still refuses same-day for genuinely made-to-order work', async () => {
    const body = await ask(7);
    expect(body).toMatchObject({ serviceable: true, dispatchDays: 7, sameDay: false });
  });

  it('offers same-day for a product that said nothing at all', async () => {
    const body = await ask(null);
    expect(body).toMatchObject({ serviceable: true, dispatchDays: rules.dispatchDays, sameDay: true });
  });
});

describe('the late clock', () => {
  it('grades a shipment against the order\'s own dispatch-by date when it has one', () => {
    const sellerId = 's1';
    const day = 86400 * 1000;
    const t0 = new Date('2026-11-01T00:00:00Z');
    const order = (n, shippedAfterDays, dispatchByDays) => ({
      _id: `o${n}`, createdAt: t0, paymentMethod: 'cod', paymentStatus: 'pending', cancelledBy: null,
      items: [{ sellerId, status: 'shipped' }],
      fulfilments: [{ sellerId, status: 'shipped', shippedAt: new Date(t0.getTime() + shippedAfterDays * day), dispatchBy: dispatchByDays ? new Date(t0.getTime() + dispatchByDays * day) : null }],
    });
    // 5 days to ship: late by the rulebook (2), on time against a 7-day made-to-order date.
    const r = sellerPerformance({ sellerId, orders: [order(1, 5, null), order(2, 5, 7)], products: [], now: new Date(t0.getTime() + 10 * day) });
    expect(r.lateDispatch.value).toBe(50);
  });
});
