/**
 * Fair Returns - the promise travels with the order (plan §4.39 left-overs,
 * 15 Sep 2026): stamped on every line at checkout, said in the confirmation
 * mail, and never guessed when the category cannot be read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Seller = require('../models/Seller');
const Coupon = require('../models/Coupon');
const { modesForProducts } = require('../utils/returnPolicy');
const { priceOrder } = require('../utils/priceOrder');
const { orderConfirmedEmail } = require('../utils/emailTemplates');

const chainable = (result) => ({
  select: () => chainable(result),
  session: () => chainable(result),
  lean: () => Promise.resolve(result),
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
});

const id = () => new mongoose.Types.ObjectId();
const CAT_R = { _id: id(), returnMode: 'R', returnModesAllowed: ['R', 'X', 'N'] };
const CAT_N = { _id: id(), returnMode: 'N', returnModesAllowed: ['N'] };
const SELLER = id();

let originals;
beforeEach(() => {
  originals = { catFind: Category.find, sellerFind: Seller.find, couponFindOne: Coupon.findOne };
  Category.find = vi.fn(() => chainable([CAT_R, CAT_N]));
  Seller.find = vi.fn(() => chainable([{ userId: SELLER, commissionRate: 10 }]));
  Coupon.findOne = vi.fn(() => chainable(null));
});
afterEach(() => {
  Category.find = originals.catFind;
  Seller.find = originals.sellerFind;
  Coupon.findOne = originals.couponFindOne;
});

describe('modesForProducts', () => {
  it('reads every category once and applies the product pick inside what the category allows', async () => {
    const saree = { _id: id(), category: CAT_R._id, returnMode: 'X' };
    const jhumka = { _id: id(), category: CAT_N._id, returnMode: 'R' }; // not allowed for the category
    const plain = { _id: id(), category: CAT_R._id };
    const modes = await modesForProducts([saree, jhumka, plain]);
    expect(modes.get(String(saree._id))).toBe('X');
    expect(modes.get(String(jhumka._id))).toBe('N');
    expect(modes.get(String(plain._id))).toBe('R');
    expect(Category.find).toHaveBeenCalledTimes(1);
  });

  it('leaves the mode blank - never guesses - when the categories cannot be read', async () => {
    Category.find = vi.fn(() => { throw new Error('no database'); });
    const p = { _id: id(), category: CAT_N._id, returnMode: 'R' };
    expect((await modesForProducts([p])).get(String(p._id))).toBeNull();
  });
});

describe('priceOrder stamps the promise on each line', () => {
  it('carries R / X / N per line', async () => {
    const items = [
      { quantity: 1, price: 500, productId: { _id: id(), name: 'Saree', price: 500, sellerId: SELLER, category: CAT_R._id } },
      { quantity: 2, price: 150, productId: { _id: id(), name: 'Jhumka', price: 150, sellerId: SELLER, category: CAT_N._id } },
    ];
    const { orderItems } = await priceOrder({ items, couponCode: null, customerId: id() });
    expect(orderItems.map((i) => i.returnMode)).toEqual(['R', 'N']);
  });
});

describe('the confirmation mail says it', () => {
  const order = (items) => ({ _id: id(), orderNumber: 'SMP-1', paymentMethod: 'cod', totalAmount: 800, items });
  const customer = { name: 'Asha' };

  it('one line when every item makes the same promise', () => {
    const m = orderConfirmedEmail(order([{ name: 'Saree', returnMode: 'R' }, { name: 'Kurta', returnMode: 'R' }]), customer);
    expect(m.text).toContain('Returns: 7-day return or exchange, counted from delivery.');
    expect(m.html).toContain('7-day return or exchange');
  });

  it('names the exceptions when they differ', () => {
    const m = orderConfirmedEmail(order([{ name: 'Saree', returnMode: 'R' }, { name: 'Jhumka', returnMode: 'N' }]), customer);
    expect(m.text).toContain('except Jhumka - no return (hygiene / custom)');
  });

  it('says nothing specific for an order whose lines were never stamped', () => {
    const m = orderConfirmedEmail(order([{ name: 'Old line' }]), customer);
    expect(m.text).not.toContain('Returns:');
    expect(m.html).toContain('returns follow the seller');
  });
});
