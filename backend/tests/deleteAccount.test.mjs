/**
 * Delete my account (DPDP, 22 Sep 2026): the person's own data goes at once,
 * the addresses on their orders stay for the records, every session ends;
 * a year on, jobs/retention scrubs the phone and street off those records
 * and blanks a seller's bank details.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const Session = require('../models/Session');
const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const Address = require('../models/Address');
const Seller = require('../models/Seller');
const AuthEvent = require('../models/AuthEvent');
const { scrubDeletedAccounts } = require('../jobs/retention');

const ID = '507f1f77bcf86cd799439011';
const bearer = jwt.sign({ userId: ID, role: 'customer', tv: 0, sid: 's1' }, process.env.JWT_SECRET);
const reauth = jwt.sign({ userId: ID, sid: 's1', purpose: 'reauth' }, process.env.JWT_SECRET);

describe('delete my account', () => {
  let doc;
  const deletes = {};
  beforeEach(() => {
    doc = { _id: ID, name: 'Asha', email: 'asha@example.com', role: 'customer', password: 'hash', isVerified: true, isBlocked: false, tokenVersion: 0, totp: { enabled: true }, save: vi.fn(async function save() { return this; }) };
    vi.spyOn(User, 'findById').mockImplementation(() => chainableQuery(doc));
    vi.spyOn(Order, 'distinct').mockResolvedValue(['addr-used']);
    for (const [name, Model] of Object.entries({ Session, Cart, Wishlist, Notification, PushSubscription, Address })) {
      deletes[name] = vi.spyOn(Model, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
    }
    vi.spyOn(AuthEvent, 'create').mockResolvedValue({});
  });
  afterEach(() => vi.restoreAllMocks());

  it('anonymises the account, ends every session, clears what is theirs alone, keeps the addresses on orders, and stamps deletedAt', async () => {
    const res = await request(app).delete('/api/auth/me').set('Authorization', `Bearer ${bearer}`).set('X-Reauth', reauth);
    expect(res.status).toBe(200);
    expect(doc.name).toBe('Deleted account');
    expect(doc.email).toMatch(/^deleted-439011@deleted\.shopmasterpro\.in$/);
    expect(doc.isBlocked).toBe(true);
    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.tokenVersion).toBe(1);
    expect(doc.totp.enabled).toBe(false);
    for (const name of ['Session', 'Cart', 'Wishlist', 'Notification', 'PushSubscription']) expect(deletes[name]).toHaveBeenCalledWith({ userId: ID });
    expect(deletes.Address).toHaveBeenCalledWith({ userId: ID, _id: { $nin: ['addr-used'] } });
    expect(res.headers['set-cookie'].join('\n')).toMatch(/smp_at=;/);
  });

  it('a year later the retention job scrubs the order addresses and a seller\'s bank details, once', async () => {
    const now = new Date('2027-10-01T00:00:00Z');
    vi.spyOn(User, 'find').mockImplementation(() => chainableQuery([{ _id: 'u1', role: 'customer' }, { _id: 'u2', role: 'seller' }]));
    const addr = vi.spyOn(Address, 'updateMany').mockResolvedValue({ modifiedCount: 2 });
    const seller = vi.spyOn(Seller, 'updateMany').mockResolvedValue({ modifiedCount: 1 });
    const stamp = vi.spyOn(User, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    const out = await scrubDeletedAccounts({ now });
    expect(User.find).toHaveBeenCalledWith({ deletedAt: { $ne: null, $lte: new Date('2026-10-01T00:00:00Z') }, scrubbedAt: null });
    expect(addr).toHaveBeenCalledTimes(2);
    expect(addr.mock.calls[0][1].$set).toEqual({ phoneNumber: '0000000000', street: '-', landmark: '' });
    expect(addr.mock.calls[0][1].$set.pincode).toBeUndefined();
    expect(seller).toHaveBeenCalledTimes(1);
    expect(seller.mock.calls[0][1].$set['bankDetails.accountNumber']).toBe('');
    expect(stamp).toHaveBeenCalledTimes(2);
    expect(stamp.mock.calls[1][1].$set.scrubbedAt).toBe(now);
    expect(out).toMatchObject({ accounts: 2, addresses: 4, sellers: 1 });
  });
});
