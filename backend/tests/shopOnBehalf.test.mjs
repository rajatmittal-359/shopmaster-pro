/**
 * Editing a shop's details on its behalf (plan 2.42, 15 Sep 2026): the same
 * rules as the seller's own Settings, every changed field named, a record on
 * the seller, a bell to the seller - and the bank account never in reach.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Seller = require('../models/Seller');
const notifier = require('../utils/notify');
const moderate = require('../utils/ai/moderate');
const { applyShopSettings } = require('../controllers/sellerController');
const admin = require('../controllers/adminController');

const mockRes = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.body = p; return r; };
  return r;
};
const shop = (over = {}) => ({
  _id: 's1', userId: 'u1', businessName: 'Meera Jewels', about: '', links: { instagram: '', facebook: '', youtube: '', googleBusiness: '', website: '' }, showLocation: false, offersFreeShipping: false,
  pickupAddress: { contactName: 'A', address1: '1 Lane', city: 'Jaipur', state: 'Rajasthan', pincode: '302019', phone: '9876500001' }, bankDetails: { accountNumber: '111', ifscCode: 'HDFC0000001', accountHolderName: 'A' }, adminEdits: [],
  save: vi.fn(async function save() { return this; }),
  ...over,
});

describe('applyShopSettings - one set of rules for both doors', () => {
  const originalModerate = moderate.moderateText;
  beforeEach(() => { moderate.moderateText = vi.fn(async () => ({ flagged: false, categories: [] })); });
  afterEach(() => { moderate.moderateText = originalModerate; });

  it('names exactly the fields that changed, and nothing when nothing did', async () => {
    const s = shop();
    const r = await applyShopSettings(s, { about: 'Handmade in Jaipur since 1998.', links: { instagram: 'instagram.com/meera' }, showLocation: true, offersFreeShipping: false });
    expect(r.error).toBeUndefined();
    expect(r.changed).toEqual(['about', 'city on the shop page', 'instagram link']);
    expect(s.links.instagram).toBe('https://instagram.com/meera');
    const again = await applyShopSettings(s, { about: 'Handmade in Jaipur since 1998.', showLocation: true });
    expect(again.changed).toEqual([]);
  });

  it('refuses a wrong-host link and a half pickup address in one sentence', async () => {
    expect((await applyShopSettings(shop(), { links: { instagram: 'https://tiktok.com/x' } })).error).toMatch(/instagram/);
    expect((await applyShopSettings(shop(), { pickupAddress: { city: 'Jaipur' } })).error).toMatch(/needs/);
  });
});

describe('"Ghar jaisa" - one switch, the whole house-shop bundle (Rajat, 20 Sep 2026)', () => {
  it('on: 0% and AI without limits, named; off: the platform rate and the caps come back; the seller door cannot touch it', async () => {
    const s = shop({ commissionRate: 8 });
    const on = await applyShopSettings(s, { homeTreatment: true }, { adminOnly: true, platformRate: 8 });
    expect(on.changed).toEqual(['ghar jaisa: 0% commission + AI without limits']);
    expect(s.homeTreatment).toBe(true);
    expect(s.commissionRate).toBe(0);
    expect(s.aiUnlimited).toBe(true);
    expect((await applyShopSettings(s, { homeTreatment: true }, { adminOnly: true, platformRate: 8 })).changed).toEqual([]);
    const off = await applyShopSettings(s, { homeTreatment: false }, { adminOnly: true, platformRate: 8 });
    expect(off.changed).toEqual(['ghar jaisa off: 8% commission + the daily AI limits']);
    expect(s.homeTreatment).toBe(false);
    expect(s.commissionRate).toBe(8);
    expect(s.aiUnlimited).toBe(false);
    const fromSeller = await applyShopSettings(s, { homeTreatment: true });
    expect(fromSeller.changed).toEqual([]);
    expect(s.homeTreatment).toBe(false);
  });
});

describe('AI without limits - a per-shop switch the admin flips (20 Sep 2026)', () => {
  it('the admin door turns it on and off and names the change; the seller door cannot', async () => {
    const s = shop();
    const on = await applyShopSettings(s, { aiUnlimited: true }, { adminOnly: true });
    expect(on.changed).toEqual(['AI without limits']);
    expect(s.aiUnlimited).toBe(true);
    const same = await applyShopSettings(s, { aiUnlimited: true }, { adminOnly: true });
    expect(same.changed).toEqual([]);
    const off = await applyShopSettings(s, { aiUnlimited: false }, { adminOnly: true });
    expect(off.changed).toEqual(['AI within the daily limits']);
    expect(s.aiUnlimited).toBe(false);
    const fromSeller = await applyShopSettings(s, { aiUnlimited: true });
    expect(fromSeller.changed).toEqual([]);
    expect(s.aiUnlimited).toBe(false);
  });
});

describe('admin edits on behalf', () => {
  const originals = { findById: Seller.findById, notify: notifier.notify, moderate: moderate.moderateText };
  let sent;
  beforeEach(() => {
    sent = [];
    notifier.notify = vi.fn(async (n) => { sent.push(n); return { inApp: true }; });
    moderate.moderateText = vi.fn(async () => ({ flagged: false, categories: [] }));
  });
  afterEach(() => {
    Seller.findById = originals.findById;
    notifier.notify = originals.notify;
    moderate.moderateText = originals.moderate;
  });
  const wait = () => new Promise((r) => setImmediate(r));

  it('saves, records who changed what, and tells the seller field by field', async () => {
    const s = shop();
    Seller.findById = vi.fn(() => Promise.resolve(s));
    const res = mockRes();
    await admin.editSellerShop({ params: { sellerId: 's1' }, user: { _id: 'admin1' }, body: { pickupAddress: { ...s.pickupAddress, address1: '7 Bapu Bazaar' }, note: 'You asked on the phone' } }, res);
    await wait();
    expect(res.statusCode).toBe(200);
    expect(res.body.changed).toEqual(['pickup address']);
    expect(s.save).toHaveBeenCalled();
    expect(s.adminEdits.at(-1)).toMatchObject({ by: 'admin1', fields: ['pickup address'], note: 'You asked on the phone' });
    expect(sent[0]).toMatchObject({ userId: 'u1', role: 'seller', category: 'account', url: '/seller/settings' });
    expect(sent[0].title).toContain('pickup address');
    expect(sent[0].body).toContain('You asked on the phone');
  });

  it('a bank account in the body is ignored - it is not a field this door has', async () => {
    const s = shop();
    Seller.findById = vi.fn(() => Promise.resolve(s));
    const res = mockRes();
    await admin.editSellerShop({ params: { sellerId: 's1' }, user: { _id: 'admin1' }, body: { bankDetails: { accountNumber: '999' }, about: 'x' } }, res);
    await wait();
    expect(s.bankDetails.accountNumber).toBe('111');
    expect(res.body.changed).toEqual(['about']);
  });

  it('nothing changed → nothing saved, nothing sent', async () => {
    const s = shop();
    Seller.findById = vi.fn(() => Promise.resolve(s));
    const res = mockRes();
    await admin.editSellerShop({ params: { sellerId: 's1' }, user: { _id: 'admin1' }, body: { showLocation: false } }, res);
    await wait();
    expect(res.body.changed).toEqual([]);
    expect(s.save).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});
