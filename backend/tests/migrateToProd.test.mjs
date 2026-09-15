/** The production move: what travels, what is stripped, what stops it (plan 2.15). */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { plan, cleanProduct, cleanSeller, cleanUser } = require('../migrateToProd');

const users = [
  { _id: 'a', email: 'admin@example.com', role: 'admin', risk: { level: 'none' } },
  { _id: 's', email: 'seller@example.com', role: 'customer' },
  { _id: 'c', email: 'buyer@example.com', role: 'customer' },
];
const sellers = [
  { _id: 'sel', userId: 's', businessName: 'House Shop', isApproved: true, bankDetails: { accountNumber: '1' }, pickupAddress: { pincode: '302019' }, adminEdits: [{ at: new Date(), fields: ['about'] }] },
  { _id: 'p1', userId: 'x', businessName: 'Partner', isApproved: true },
];
const settings = { _id: 'platform', rules: { version: '1.2' }, announcement: { enabled: true, text: 'Sale!' } };
const products = [
  { _id: 1, sellerId: 's', name: 'Kundan set', isActive: true, vector: [1, 2], vectorHash: 'h', avgRating: 4.5, totalReviews: 9, reserved: 2 },
  { _id: 2, sellerId: 's', name: 'TEST Rupee One Nose Pin', isActive: true },
  { _id: 3, sellerId: 's', name: 'Hidden one', isActive: false },
  { _id: 4, sellerId: 'x', name: 'Partner thing', isActive: true },
];
const opts = { adminEmail: 'admin@example.com', sellerEmail: 'seller@example.com' };

describe('plan', () => {
  it('moves the admin, the house shop and settings with the announcement off - nothing else', () => {
    const p = plan({ users, sellers, settings, products }, { ...opts, withProducts: false });
    expect(p.admin.email).toBe('admin@example.com');
    expect(p.seller.businessName).toBe('House Shop');
    expect(p.settings.announcement.enabled).toBe(false);
    expect(p.settings.rules.version).toBe('1.2');
    expect(p.products).toEqual([]);
    expect(p.problems).toEqual([]);
  });
  it('--with-products takes the house shop\'s live products and skips TEST/MESSY, hidden and other sellers', () => {
    const p = plan({ users, sellers, settings, products }, { ...opts, withProducts: true });
    expect(p.products.map((x) => x._id)).toEqual([1]);
    expect(p.skippedTest).toBe(1);
  });
  it('names what is missing instead of guessing', () => {
    const p = plan({ users: users.filter((u) => u.role !== 'admin'), sellers: [], settings: null, products: [] }, opts);
    expect(p.problems).toEqual(expect.arrayContaining([expect.stringMatching(/no admin user/), expect.stringMatching(/no Seller document/), expect.stringMatching(/no platform settings/)]));
  });
});

describe('what is stripped on the way', () => {
  it('products lose vectors and dev-history counters; the seller loses admin edits; the user loses a risk record', () => {
    expect(cleanProduct(products[0])).toEqual({ _id: 1, sellerId: 's', name: 'Kundan set', isActive: true, avgRating: 0, totalReviews: 0, reserved: 0 });
    expect(cleanSeller(sellers[0]).adminEdits).toEqual([]);
    expect(cleanUser(users[0]).risk).toBeUndefined();
  });
});
