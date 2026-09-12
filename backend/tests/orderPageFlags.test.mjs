/**
 * The flags the customer's order page draws its buttons from.
 *
 * The rule in this codebase is that the server decides and the page draws.
 * The order page had offered "Cancel item" on a shipped parcel and had no way
 * to raise a dispute at all; both are now answered here, once, so the button
 * and the endpoint that serves it cannot disagree.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const { cancellableItemIds } = require('../utils/cancelOrder');
const { customerMayDispute } = require('../utils/deliveryTruth');

const id = () => new mongoose.Types.ObjectId();

describe('cancellableItemIds', () => {
  const live = { _id: id(), status: 'active' };
  const gone = { _id: id(), status: 'cancelled' };

  it('lists the live lines of an order that has not shipped', () => {
    expect(cancellableItemIds({ status: 'pending', items: [live, gone] })).toEqual([String(live._id)]);
    expect(cancellableItemIds({ status: 'processing', items: [live] })).toEqual([String(live._id)]);
  });

  it('lists nothing once the order has moved on', () => {
    for (const status of ['shipped', 'delivered', 'cancelled', 'returned']) {
      expect(cancellableItemIds({ status, items: [live] })).toEqual([]);
    }
  });

  it('copes with an order that has no items array', () => {
    expect(cancellableItemIds({ status: 'pending' })).toEqual([]);
  });
});

describe('customerMayDispute', () => {
  it('refuses before anything has been sent - that is a cancellation, not an argument', () => {
    expect(customerMayDispute({ fulfilments: [{ status: 'pending' }, { status: 'processing' }] }))
      .toEqual({ allowed: false, reason: 'not_sent' });
    expect(customerMayDispute({ fulfilments: [] })).toEqual({ allowed: false, reason: 'not_sent' });
  });

  it('allows once a parcel is shipped or delivered', () => {
    expect(customerMayDispute({ fulfilments: [{ status: 'shipped' }] }).allowed).toBe(true);
    expect(customerMayDispute({ fulfilments: [{ status: 'pending' }, { status: 'delivered' }] }).allowed).toBe(true);
  });

  it('allows one argument at a time', () => {
    expect(customerMayDispute({ fulfilments: [{ status: 'delivered', disputeStatus: 'open' }] }))
      .toEqual({ allowed: false, reason: 'already_open' });
  });

  it('allows again once the last one was decided', () => {
    expect(customerMayDispute({ fulfilments: [{ status: 'delivered', disputeStatus: 'resolved_seller' }] }).allowed).toBe(true);
  });
});
