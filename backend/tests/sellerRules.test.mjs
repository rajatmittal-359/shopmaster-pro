/**
 * The seller rulebook, enforced.
 *
 * Amazon, Flipkart and Meesho all run on rules a seller reads before they
 * list and feels in the payout when they break them. Ours were scattered and
 * unenforced: a seller could cancel a paid order for free and nothing
 * recorded it against them, and nobody had agreed to anything before
 * becoming a seller. These tests hold the three parts that carry money or
 * consent:
 *
 *   1. a seller-caused cancellation beyond the free allowance is charged,
 *      and a customer- or platform-caused one never is;
 *   2. the payout subtracts unclaimed charges exactly once;
 *   3. nobody becomes a seller without accepting the current agreement.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const rules = require('../config/sellerRules');
const Order = require('../models/Order');
const SellerCharge = require('../models/SellerCharge');
const { chargeForSellerCancel } = require('../utils/sellerCharges');

const SELLER = new mongoose.Types.ObjectId();

describe('the rulebook', () => {
  it('has a version, a flat penalty and a free allowance', () => {
    expect(rules.version).toMatch(/^\d+\.\d+$/);
    expect(rules.cancelPenalty).toBeGreaterThan(0);
    expect(rules.cancelFreePer30Days).toBeGreaterThanOrEqual(1);
  });
});

describe('charging a seller-caused cancellation', () => {
  const originals = {};
  let recentCancels = 0;
  let created = [];

  beforeEach(() => {
    created = [];
    originals.count = Order.countDocuments;
    originals.create = SellerCharge.create;
    Order.countDocuments = vi.fn(async () => recentCancels);
    SellerCharge.create = vi.fn(async (doc) => {
      created.push(doc);
      return { _id: new mongoose.Types.ObjectId(), ...doc };
    });
  });
  afterEach(() => {
    Order.countDocuments = originals.count;
    SellerCharge.create = originals.create;
  });

  const order = () => ({
    _id: new mongoose.Types.ObjectId(),
    orderNumber: 'SMP-TEST-1',
    fulfilments: [{ sellerId: SELLER, status: 'cancelled' }],
  });

  it('is free while the seller is inside the monthly allowance', async () => {
    recentCancels = rules.cancelFreePer30Days; // this one included
    const result = await chargeForSellerCancel(order(), SELLER, { by: 'seller' });
    expect(result.charged).toBe(0);
    expect(created).toHaveLength(0);
  });

  it('charges the flat penalty once the allowance is used up, and stamps the parcel', async () => {
    recentCancels = rules.cancelFreePer30Days + 1;
    const o = order();
    const result = await chargeForSellerCancel(o, SELLER, { by: 'seller' });
    expect(result.charged).toBe(rules.cancelPenalty);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ sellerId: SELLER, orderId: o._id, kind: 'seller_cancel', amount: rules.cancelPenalty, payoutId: null });
    expect(o.fulfilments[0].cancelPenalty).toBe(rules.cancelPenalty);
  });

  it('never charges a cancellation the customer or the platform asked for', async () => {
    recentCancels = 99;
    for (const by of ['customer', 'admin']) {
      const result = await chargeForSellerCancel(order(), SELLER, { by });
      expect(result.charged).toBe(0);
    }
    expect(created).toHaveLength(0);
  });
});

describe('the payout subtracts unclaimed charges', () => {
  it('nets charges off the earning and claims them exactly once', async () => {
    const { applyChargesToPayout } = require('../utils/sellerCharges');
    const charges = [
      { _id: 'c1', amount: 50, payoutId: null },
      { _id: 'c2', amount: 50, payoutId: null },
    ];
    let claimedWith = null;
    const stubs = {
      findUnclaimed: async () => charges,
      claim: async (ids, payoutId) => {
        claimedWith = { ids, payoutId };
      },
    };
    const payout = { _id: 'p1', netPayable: 1000, deductions: 0 };
    await applyChargesToPayout(payout, stubs);
    expect(payout.deductions).toBe(100);
    expect(payout.netPayable).toBe(900);
    expect(claimedWith).toEqual({ ids: ['c1', 'c2'], payoutId: 'p1' });
  });

  it('never takes a payout below zero - the remainder is written off, not carried', async () => {
    const { applyChargesToPayout } = require('../utils/sellerCharges');
    const payout = { _id: 'p2', netPayable: 30, deductions: 0 };
    await applyChargesToPayout(payout, { findUnclaimed: async () => [{ _id: 'c', amount: 50, payoutId: null }], claim: async () => {} });
    expect(payout.netPayable).toBe(0);
    expect(payout.deductions).toBe(30);
  });
});

describe('becoming a seller needs the agreement', () => {
  it('refuses without acceptance, in words', async () => {
    const { becomeSeller } = require('../controllers/authController');
    let status = 200;
    let body = null;
    const res = { status: (c) => { status = c; return res; }, json: (p) => { body = p; return res; } };
    await becomeSeller({ user: { _id: SELLER }, body: { businessName: 'Rahul Handlooms' } }, res);
    expect(status).toBe(400);
    expect(body.message).toMatch(/agree|agreement|terms/i);
    expect(body.agreementVersion).toBe(rules.version);
  });
});
