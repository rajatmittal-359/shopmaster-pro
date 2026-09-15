/**
 * The seller application (plan 2.40, 15 Sep 2026): fields validated as they
 * come in, the duplicate query, and the review loop - approve / ask / turn
 * down - each telling the shop what happened.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const notifier = require('../utils/notify');
const settings = require('../utils/liveSettings');
const rules = require('../config/sellerRules');
const { fieldsFrom, duplicates } = require('../utils/application');
const { becomeSeller } = require('../controllers/authController');
const admin = require('../controllers/adminController');

const chainable = (result) => ({
  select: () => chainable(result),
  populate: () => chainable(result),
  lean: () => Promise.resolve(result),
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
});
const mockRes = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.body = p; return r; };
  return r;
};
const id = () => new mongoose.Types.ObjectId();

describe('fieldsFrom - what a request may carry', () => {
  it('accepts a full GST application and fills the PAN from the GSTIN', () => {
    const r = fieldsFrom({ legalName: 'Meera Jewels', gstMode: 'gstin', gstin: '07aagff2194n1z1', phone: '+91 98765 43210', pincode: '302 019', city: 'Jaipur', sells: 'Kundan and meenakari jewellery' });
    expect(r.error).toBeUndefined();
    expect(r.fields).toMatchObject({ legalName: 'Meera Jewels', gstMode: 'gstin', gstin: '07AAGFF2194N1Z1', pan: 'AAGFF2194N', phone: '9876543210', pincode: '302019', city: 'Jaipur' });
  });
  it('refuses a GSTIN that belongs to a different PAN, and a mistyped GSTIN, in one sentence each', () => {
    expect(fieldsFrom({ pan: 'ABCPD1234E', gstMode: 'gstin', gstin: '07AAGFF2194N1Z1' }).error).toMatch(/registered to PAN AAGFF2194N/);
    expect(fieldsFrom({ gstMode: 'gstin', gstin: '07AAGFF2194N1Z2' }).error).toMatch(/check digit/);
    expect(fieldsFrom({ pan: 'nope' }).error).toMatch(/PAN/);
    expect(fieldsFrom({ phone: '12345' }).error).toMatch(/Phone/);
  });
  it('the no-GST route: enrolment number carries the PAN; "none" is allowed', () => {
    expect(fieldsFrom({ gstMode: 'enrolment', enrolmentNumber: '08ABCPD1234E1ZX' }).fields).toMatchObject({ gstMode: 'enrolment', pan: 'ABCPD1234E' });
    expect(fieldsFrom({ pan: 'ABCPD1234E', gstMode: 'none' }).fields).toMatchObject({ gstMode: 'none', pan: 'ABCPD1234E' });
  });
  it('the old app sends only a name - still fine', () => {
    expect(fieldsFrom({})).toEqual({ fields: {} });
  });
});

describe('duplicates - the same identity on another shop', () => {
  const originalFind = Seller.find;
  afterEach(() => { Seller.find = originalFind; });
  it('names what is shared and the other shop\'s state', async () => {
    const me = { _id: id(), application: { pan: 'ABCPD1234E', phone: '9876543210' }, bankDetails: { accountNumber: '111' } };
    Seller.find = vi.fn(() => chainable([
      { _id: id(), businessName: 'Old shop', isApproved: false, kycStatus: 'rejected', status: 'active', application: { pan: 'ABCPD1234E', phone: '9999999999' }, bankDetails: { accountNumber: '111' } },
    ]));
    const d = await duplicates(me);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ businessName: 'Old shop', state: 'turned down', shared: ['PAN', 'bank account'] });
    const q = Seller.find.mock.calls[0][0];
    expect(q.$or.length).toBeGreaterThan(0);
  });
  it('nothing to compare, no query', async () => {
    Seller.find = vi.fn();
    expect(await duplicates({ _id: id(), application: {} })).toEqual([]);
    expect(Seller.find).not.toHaveBeenCalled();
  });
});

describe('becomeSeller stores the application and validates it first', () => {
  const originals = { findOne: Seller.findOne, create: Seller.create, live: settings.liveSettings, notifyAdmins: notifier.notifyAdmins };
  beforeEach(() => {
    settings.liveSettings = vi.fn(async () => null);
    Seller.findOne = vi.fn(() => chainable(null));
    notifier.notifyAdmins = vi.fn(async () => []);
  });
  afterEach(() => {
    Seller.findOne = originals.findOne;
    Seller.create = originals.create;
    settings.liveSettings = originals.live;
    notifier.notifyAdmins = originals.notifyAdmins;
  });
  const agreed = { acceptedSellerAgreement: true, agreementVersion: rules.version };

  it('a bad GSTIN is a 400 with the reason, and nothing is created', async () => {
    Seller.create = vi.fn();
    const res = mockRes();
    await becomeSeller({ user: { _id: id() }, body: { businessName: 'New shop', ...agreed, gstMode: 'gstin', gstin: '07AAGFF2194N1Z9' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/GSTIN/);
    expect(Seller.create).not.toHaveBeenCalled();
  });

  it('a good one is created with application.status submitted and the GSTIN copied to gstNumber', async () => {
    let created = null;
    Seller.create = vi.fn(async (doc) => { created = doc; return { ...doc, _id: id(), isApproved: false }; });
    const res = mockRes();
    await becomeSeller({ user: { _id: id() }, body: { businessName: 'New shop', ...agreed, legalName: 'New Shop Traders', gstMode: 'gstin', gstin: '07AAGFF2194N1Z1', city: 'Jaipur', pincode: '302019' } }, res);
    expect(res.statusCode).toBe(201);
    expect(created.application).toMatchObject({ status: 'submitted', pan: 'AAGFF2194N', gstin: '07AAGFF2194N1Z1', legalName: 'New Shop Traders', city: 'Jaipur' });
    expect(created.gstNumber).toBe('07AAGFF2194N1Z1');
    expect(created.application.submittedAt).toBeInstanceOf(Date);
  });
});

describe('the review loop tells the shop', () => {
  const originals = { fbu: Seller.findByIdAndUpdate, fou: Seller.findOneAndUpdate, notify: notifier.notify };
  let sent;
  beforeEach(() => {
    sent = [];
    notifier.notify = vi.fn(async (n) => { sent.push(n); return { inApp: true }; });
  });
  afterEach(() => {
    Seller.findByIdAndUpdate = originals.fbu;
    Seller.findOneAndUpdate = originals.fou;
    notifier.notify = originals.notify;
  });
  const wait = () => new Promise((r) => setImmediate(r));

  it('approve sets the application approved and rings the seller', async () => {
    let update = null;
    Seller.findByIdAndUpdate = vi.fn((_id, u) => { update = u; return chainable({ _id: 's1', businessName: 'New shop', userId: { _id: 'u1' } }); });
    const res = mockRes();
    await admin.approveSeller({ params: { sellerId: 's1' } }, res);
    await wait();
    expect(update).toMatchObject({ isApproved: true, 'application.status': 'approved' });
    expect(sent[0]).toMatchObject({ userId: 'u1', role: 'seller', category: 'account', url: '/seller' });
    expect(sent[0].title).toContain('approved');
  });

  it('ask needs a reason, moves to needs_info, and the bell carries the exact ask', async () => {
    Seller.findOneAndUpdate = vi.fn((q, u) => chainable({ _id: 's1', businessName: 'New shop', userId: { _id: 'u1' } }));
    const short = mockRes();
    await admin.askSeller({ params: { sellerId: 's1' }, body: { reason: 'x' } }, short);
    expect(short.statusCode).toBe(400);
    const res = mockRes();
    await admin.askSeller({ params: { sellerId: 's1' }, body: { reason: 'The GSTIN belongs to another PAN - send the PAN the GST is on.' } }, res);
    await wait();
    expect(res.statusCode).toBe(200);
    const [q, u] = Seller.findOneAndUpdate.mock.calls[0];
    expect(q).toMatchObject({ _id: 's1', isApproved: false });
    expect(u['application.status']).toBe('needs_info');
    expect(sent[0].body).toContain('another PAN');
    expect(sent[0].url).toBe('/sell');
  });

  it('turning down records the reason and says the door is open', async () => {
    let update = null;
    Seller.findByIdAndUpdate = vi.fn((_id, u) => { update = u; return chainable({ _id: 's1', businessName: 'New shop', userId: { _id: 'u1' } }); });
    const res = mockRes();
    await admin.rejectSeller({ params: { sellerId: 's1' }, body: { reason: 'No real shop in the photo' } }, res);
    await wait();
    expect(update).toMatchObject({ kycStatus: 'rejected', 'application.status': 'rejected', 'application.rejectReason': 'No real shop in the photo' });
    expect(sent[0].body).toMatch(/send it again/);
  });
});
