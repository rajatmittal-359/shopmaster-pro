/**
 * The seller-application brief is facts, not a verdict (plan 2.19, 15 Sep 2026).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Order = require('../models/Order');
const { applicationFacts } = require('../utils/applicationFacts');

const chainable = (result) => ({
  select: () => chainable(result),
  lean: () => Promise.resolve(result),
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
});

const originalFind = Order.find;
afterEach(() => {
  Order.find = originalFind;
});

describe('applicationFacts', () => {
  it('reads what the application does not say about itself', async () => {
    Order.find = vi.fn(() => chainable([{ fulfilments: [{ status: 'delivered' }] }, { fulfilments: [{ status: 'delivered' }] }]));
    const a = await applicationFacts({
      createdAt: new Date('2026-09-14'),
      userId: { _id: 'u1', isVerified: true, createdAt: new Date(Date.now() - 30 * 86400000) },
      pickupAddress: { city: 'Jaipur', state: 'Rajasthan', pincode: '302019' },
      bankDetails: { accountNumber: '1234' },
      gstNumber: '',
      about: 'Family-run handloom shop in Jaipur since 1998, kundan and meenakari made by hand, every piece photographed on the item.',
      links: { instagram: 'https://instagram.com/x', googleBusiness: '', website: '' },
    });
    expect(a).toMatchObject({ emailVerified: true, accountAgeDays: 30, pickup: 'Jaipur, Rajasthan 302019', inJaipur: true, bank: true, gst: false, links: 1 });
    expect(a.aboutWords).toBeGreaterThan(15);
    expect(a.buyer).toMatchObject({ orders: 2, level: 'clean' });
  });

  it('a bare application is dashes, not a refusal; a dead database blanks the buyer record only', async () => {
    Order.find = vi.fn(() => { throw new Error('no database'); });
    const a = await applicationFacts({ businessName: 'New shop', userId: { _id: 'u2', isVerified: false } });
    expect(a).toMatchObject({ emailVerified: false, accountAgeDays: null, pickup: null, inJaipur: false, bank: false, gst: false, aboutWords: 0, links: 0, buyer: null });
  });
});
