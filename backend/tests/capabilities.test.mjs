/**
 * One account, two things it can do.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   `User.role` was a single enum, so an account was a customer OR a seller.
 *   Charming Jewels sells here and buys here, and its own account was answered
 *   403 by every /customer route. A shopper who wanted to sell had to register
 *   again with a second email.
 *
 * THE RULES BEING LOCKED DOWN
 *   1. anybody signed in can buy - buying is not a role
 *   2. selling needs a Seller RECORD, which is the thing an admin approves
 *   3. admin is still a role, and an admin is not a shopper
 *   4. the token is never the authority: authorisation is read from the
 *      database, so a suspension takes effect immediately rather than whenever
 *      the token happens to expire
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const { capabilitiesFor } = require('../utils/capabilities');
const roleMiddleware = require('../middlewares/roleMiddleware');

const CUSTOMER = { _id: 'u1', role: 'customer' };
const SELLER = { _id: 'u2', role: 'seller' };
const ADMIN = { _id: 'u3', role: 'admin' };

const originals = {};

/** Pretend the database is there, and answer with `doc` when asked. */
const withSellerRecord = (doc) => {
  Object.defineProperty(mongoose.connection, 'readyState', {
    value: 1,
    configurable: true,
  });
  Seller.findOne = vi.fn(() => ({ select: () => ({ lean: async () => doc }) }));
  return Seller.findOne;
};

beforeEach(() => {
  originals.findOne = Seller.findOne;
});

afterEach(() => {
  Seller.findOne = originals.findOne;
  // Back to "no connection", which is what every other test assumes.
  Object.defineProperty(mongoose.connection, 'readyState', {
    value: 0,
    configurable: true,
  });
});

describe('what an account can do', () => {
  it('lets anybody signed in buy', async () => {
    withSellerRecord(null);

    expect((await capabilitiesFor(CUSTOMER)).customer).toBe(true);
    expect((await capabilitiesFor(SELLER)).customer).toBe(true);
  });

  it('does NOT make an admin a shopper', async () => {
    // Deliberate: the platform's own account buying through the platform
    // muddles every report that counts orders.
    expect((await capabilitiesFor(ADMIN)).customer).toBe(false);
    expect((await capabilitiesFor(ADMIN)).admin).toBe(true);
  });

  it('grants selling to a customer who has a seller record', async () => {
    withSellerRecord({ isApproved: true, status: 'active' });

    const can = await capabilitiesFor(CUSTOMER);
    expect(can.seller).toBe(true);
    expect(can.sellerApproved).toBe(true);
  });

  it('refuses selling to a customer who has none', async () => {
    withSellerRecord(null);

    expect((await capabilitiesFor(CUSTOMER)).seller).toBe(false);
  });

  it('counts an unapproved application as the capability, and says it is unapproved', async () => {
    // The record IS the application. Whether they may list is decided by
    // requireApprovedSeller, which owns that rule - this only reports it.
    withSellerRecord({ isApproved: false, status: 'active' });

    const can = await capabilitiesFor(CUSTOMER);
    expect(can.seller).toBe(true);
    expect(can.sellerApproved).toBe(false);
  });

  it('does not query for a record it does not need', async () => {
    const query = withSellerRecord({ isApproved: true });

    await capabilitiesFor(CUSTOMER, { includeSeller: false });

    expect(query).not.toHaveBeenCalled();
  });

  it('takes an established seller at the database’s word without a second query', async () => {
    const query = withSellerRecord(null);

    expect((await capabilitiesFor(SELLER)).seller).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('claims nothing when there is no database to check', async () => {
    // Fails CLOSED. A capability we cannot verify is one we must not grant.
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

    expect((await capabilitiesFor(CUSTOMER)).seller).toBe(false);
  });
});

describe('the middleware that decides', () => {
  const run = async (user, allowed) => {
    const req = { user };
    let status = null;
    let body = null;
    const res = {
      status: (code) => {
        status = code;
        return res;
      },
      json: (payload) => {
        body = payload;
        return res;
      },
    };
    const next = vi.fn();

    await roleMiddleware(allowed)(req, res, next);
    return { status, body, next, req };
  };

  it('lets a SELLER use the customer routes - the bug that started this', async () => {
    const { next } = await run(SELLER, 'customer');
    expect(next).toHaveBeenCalled();
  });

  it('lets a customer with a seller record into the seller routes', async () => {
    withSellerRecord({ isApproved: true, status: 'active' });

    const { next } = await run(CUSTOMER, 'seller');
    expect(next).toHaveBeenCalled();
  });

  it('keeps a customer without one out', async () => {
    withSellerRecord(null);

    const { status, next } = await run(CUSTOMER, 'seller');
    expect(status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps everyone but an admin out of the admin routes', async () => {
    withSellerRecord({ isApproved: true, status: 'active' });

    expect((await run(SELLER, 'admin')).status).toBe(403);
    expect((await run(CUSTOMER, 'admin')).status).toBe(403);
    expect((await run(ADMIN, 'admin')).next).toHaveBeenCalled();
  });

  it('answers 401 when nobody is signed in', async () => {
    const { status } = await run(null, 'customer');
    expect(status).toBe(401);
  });

  it('reports capabilities rather than a role when it refuses', async () => {
    withSellerRecord(null);

    const { body } = await run(CUSTOMER, 'seller');
    // "yourRole: seller" used to be printed at people whose real problem was
    // that no seller record existed at all.
    expect(body.yourCapabilities).toContain('customer');
    expect(body.yourCapabilities).not.toContain('seller');
  });

  it('hands the answer on, so a controller need not ask again', async () => {
    withSellerRecord({ isApproved: true, status: 'active' });

    const { req } = await run(CUSTOMER, 'seller');
    expect(req.capabilities.seller).toBe(true);
  });
});
