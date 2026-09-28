/**
 * Removing an address that an order still needs.
 *
 * WHY THIS IS TESTED (28 Sep 2026)
 *   An order carries `shippingAddressId` and nothing else - there is no copy
 *   of the address on the order. The invoice reads it for place of supply,
 *   the courier booking reads it to collect the parcel, and
 *   `sellerController` refuses outright with "Delivery address is missing"
 *   when it is gone. So a customer tidying their address book could make
 *   their own pending order unshippable, and the dialog told them it was
 *   safe.
 *
 *   The rule now is the one Shopify states for anything money has touched
 *   and the one `deleteMe` already followed: an address nothing points at is
 *   deleted; one an order points at is retired.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Address = require('../models/Address.js');
const Order = require('../models/Order.js');
const { deleteAddress, getMyAddresses } = require('../controllers/addressController.js');

const USER = '6a93cf88fbb4f39f4a6d5618';
const ID = '6a93cf84fbb4f39f4a6d559d';

const res = () => {
  const r = { code: 200, body: null };
  r.status = (c) => {
    r.code = c;
    return r;
  };
  r.json = (b) => {
    r.body = b;
    return r;
  };
  return r;
};

const originals = {};
beforeEach(() => {
  originals.exists = Order.exists;
  originals.del = Address.findOneAndDelete;
  originals.upd = Address.findOneAndUpdate;
  originals.find = Address.find;
});
afterEach(() => {
  Order.exists = originals.exists;
  Address.findOneAndDelete = originals.del;
  Address.findOneAndUpdate = originals.upd;
  Address.find = originals.find;
});

describe('an address no order points at', () => {
  it('is really deleted', async () => {
    Order.exists = vi.fn(async () => null);
    Address.findOneAndDelete = vi.fn(async () => ({ _id: ID }));
    Address.findOneAndUpdate = vi.fn();

    const r = res();
    await deleteAddress({ user: { _id: USER }, params: { id: ID } }, r);

    expect(Address.findOneAndDelete).toHaveBeenCalled();
    expect(Address.findOneAndUpdate).not.toHaveBeenCalled();
    expect(r.body.retired).toBeUndefined();
  });
});

describe('an address an order points at', () => {
  it('is retired, not deleted - the parcel still has to be shipped', async () => {
    Order.exists = vi.fn(async () => ({ _id: 'an-order' }));
    Address.findOneAndDelete = vi.fn();
    Address.findOneAndUpdate = vi.fn(async () => ({ _id: ID, retiredAt: new Date() }));

    const r = res();
    await deleteAddress({ user: { _id: USER }, params: { id: ID } }, r);

    expect(Address.findOneAndDelete).not.toHaveBeenCalled();
    expect(r.body.retired).toBe(true);

    const [query, update] = Address.findOneAndUpdate.mock.calls[0];
    expect(query).toMatchObject({ _id: ID, userId: USER, retiredAt: null });
    expect(update.$set.retiredAt).toBeInstanceOf(Date);
    // It must not stay the default, or the next checkout preselects an
    // address the customer believes they removed.
    expect(update.$set.isDefault).toBe(false);
  });

  it('is asked about by address id, not by user - any order counts', async () => {
    Order.exists = vi.fn(async () => null);
    Address.findOneAndDelete = vi.fn(async () => ({ _id: ID }));
    await deleteAddress({ user: { _id: USER }, params: { id: ID } }, res());

    expect(Order.exists).toHaveBeenCalledWith({ shippingAddressId: ID });
  });
});

describe('the address book', () => {
  it('leaves retired addresses out', async () => {
    Address.find = vi.fn(async () => []);
    await getMyAddresses({ user: { _id: USER } }, res());
    expect(Address.find).toHaveBeenCalledWith({ userId: USER, retiredAt: null });
  });
});
