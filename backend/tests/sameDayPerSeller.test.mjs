/**
 * Same-day is collected from the SELLER who is shipping (2.84, 2 Oct 2026).
 *
 * Rajat, looking at the Borzo account: "Borzo me sirf Charming Jewels thodi,
 * aur koi Jaipur ka seller bhi to bhej sakta hai." He was right and the code
 * could not do it: `bookSameDay` built its pickup from BORZO_PICKUP_ADDRESS and
 * named the contact "ShopMaster Pro", so every same-day booking - whoever sold
 * the item - sent a rider to the one address in the env. A second seller's
 * parcel would be collected from a shop that does not have it, and the rider
 * would have nobody to call. Nothing threw: the quote succeeded, the booking
 * succeeded, only the pickup was wrong.
 *
 * Standard shipping had already learnt this (2.54): one rate call per seller,
 * from their own pincode. This is the same lesson for the same-day leg.
 *
 * Amazon and Flipkart both split a basket by seller and let the speed differ
 * per shipment; ours keeps ONE deliveryOption on the order, so a basket with
 * two sellers simply is not offered same-day rather than being collected from
 * the wrong one of them. The per-fulfilment version is WHAT-IS-LEFT 2.84b.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const axios = require('axios');
const Seller = require('../models/Seller');
const settings = require('../utils/liveSettings');
const borzo = require('../utils/borzo');
const { isLocalDelivery, getDeliveryOptions } = require('../utils/shipping');

const HOUSE = new mongoose.Types.ObjectId();
const RAHUL = new mongoose.Types.ObjectId();

/** Rahul ships from Kolkata; the env default is Jaipur. */
const RAHUL_PICKUP = {
  contactName: 'Rahul Kumar',
  address1: '14 Lake Road',
  city: 'Kolkata',
  state: 'West Bengal',
  pincode: '700029',
  phone: '9876501234',
};

const address = { street: '5 Park Street', city: 'Kolkata', state: 'West Bengal', zipCode: '700016', phoneNumber: '9811122233' };
const line = (sellerId) => ({ productId: { _id: new mongoose.Types.ObjectId(), sellerId, weight: 0.5, price: 900, isActive: true }, quantity: 1 });

const originals = {};
let posted;

beforeEach(() => {
  originals.env = { ...process.env };
  process.env.SHIPROCKET_PICKUP_PINCODE = '302019';
  process.env.BORZO_API_TOKEN = 'test-token';
  process.env.BORZO_ENV = 'production';
  process.env.BORZO_PICKUP_ADDRESS = 'C-13 Hari Marg, Jaipur';
  process.env.BORZO_PICKUP_PHONE = '9000000000';

  originals.find = Seller.find;
  originals.live = settings.liveSettings;
  originals.post = axios.post;
  originals.get = axios.get;

  settings.liveSettings = vi.fn(async () => null);
  originals.findOne = Seller.findOne;
  Seller.findOne = vi.fn((filter) => {
    const id = String(filter?.userId || '');
    if (id === String(RAHUL)) return chainableQuery({ userId: RAHUL, isPlatformOwned: false, pickupAddress: RAHUL_PICKUP });
    if (id === String(HOUSE)) return chainableQuery({ userId: HOUSE, isPlatformOwned: true, pickupAddress: { pincode: '302019' } });
    return chainableQuery(null);
  });
  Seller.find = vi.fn((filter) => {
    if (filter && filter.offersFreeShipping) return chainableQuery([]);
    return chainableQuery([
      { userId: HOUSE, isPlatformOwned: true, pickupAddress: { pincode: '302019' } },
      { userId: RAHUL, isPlatformOwned: false, pickupAddress: RAHUL_PICKUP },
    ]);
  });

  posted = [];
  axios.post = vi.fn(async (url, body) => {
    posted.push({ url, body });
    return {
      data: {
        is_successful: true,
        order: {
          order_id: 7001,
          order_name: 'BZ-7001',
          payment_amount: '129',
          points: [{}, { required_finish_datetime: new Date(Date.now() + 3 * 3600 * 1000).toISOString() }],
        },
      },
    };
  });
  // Wallet check: enough money, so the option is not withdrawn for balance.
  axios.get = vi.fn(async () => ({ data: { is_successful: true, client: { balance_amount: '5000' } } }));
});

afterEach(() => {
  process.env = originals.env;
  Seller.find = originals.find;
  Seller.findOne = originals.findOne;
  settings.liveSettings = originals.live;
  axios.post = originals.post;
  axios.get = originals.get;
});

describe('isLocalDelivery is asked about a seller, not about the env', () => {
  it("uses the pickup pincode it is given rather than the house shop's", () => {
    // Kolkata buyer, Kolkata seller: local, even though the env says Jaipur.
    expect(isLocalDelivery('700016', '700029')).toBe(true);
    // The same buyer against the env default is not local.
    expect(isLocalDelivery('700016')).toBe(false);
  });
});

describe('the rider is sent to the seller who is shipping', () => {
  it("quotes from the seller's own address, phone and name", async () => {
    const options = await getDeliveryOptions([line(RAHUL)], address, false);

    const quote = posted.find((p) => p.url.includes('calculate-order'));
    expect(quote).toBeTruthy();
    const pickupPoint = quote.body.points[0];
    expect(pickupPoint.address).toContain('14 Lake Road');
    expect(pickupPoint.contact_person).toMatchObject({ name: 'Rahul Kumar', phone: '9876501234' });
    // Never the platform, and never the env address, for an outside seller.
    expect(pickupPoint.address).not.toContain('Hari Marg');
    expect(pickupPoint.contact_person.name).not.toBe('ShopMaster Pro');

    expect(options.some((o) => o.id === 'same_day' && o.available !== false)).toBe(true);
  });

  it('books from the same address it quoted', async () => {
    const order = { orderNumber: 'SMP-1', customerId: { name: 'Asha' } };
    const seller = { isPlatformOwned: false, pickupAddress: RAHUL_PICKUP };

    const r = await borzo.bookSameDay(order, address, 0.5, borzo.sameDayPickupFor(seller));

    expect(r.ok).toBe(true);
    const booking = posted.find((p) => p.url.includes('create-order'));
    const pickupPoint = booking.body.points[0];
    expect(pickupPoint.address).toContain('14 Lake Road');
    expect(pickupPoint.contact_person).toMatchObject({ name: 'Rahul Kumar', phone: '9876501234' });
  });

  it('the house shop still ships from the env address, as it always did', () => {
    const pickup = borzo.sameDayPickupFor({ isPlatformOwned: true, pickupAddress: {} });
    expect(pickup).toMatchObject({ address: 'C-13 Hari Marg, Jaipur', phone: '9000000000' });
  });

  it('a seller with no pickup address on file gets no same-day pickup at all', () => {
    expect(borzo.sameDayPickupFor({ isPlatformOwned: false, pickupAddress: {} })).toBeNull();
    expect(borzo.sameDayPickupFor(null)).toBeNull();
  });
});

describe('the booking carries the pickup the quote used', () => {
  it('bookForOrder hands the seller pickup to Borzo', async () => {
    const shipment = require('../utils/shipmentBooking');
    const order = { orderNumber: 'SMP-2', deliveryOption: 'same_day', status: 'processing', items: [{ quantity: 1, productId: { weight: 0.5 } }], customerId: { name: 'Asha' } };

    const r = await shipment.bookForOrder(order, address, { pickup: borzo.sameDayPickupFor({ isPlatformOwned: false, pickupAddress: RAHUL_PICKUP }) });

    expect(r.ok).toBe(true);
    const booking = posted.find((p) => p.url.includes('create-order'));
    expect(booking.body.points[0].contact_person).toMatchObject({ name: 'Rahul Kumar', phone: '9876501234' });
  });

  it('falls back to the shop name when the pickup has no contact person', () => {
    const pickup = borzo.sameDayPickupFor({ isPlatformOwned: false, businessName: 'Rahul All in one', pickupAddress: { ...RAHUL_PICKUP, contactName: '' } });
    // A rider has to ask for somebody at the door; the shop's name is the
    // honest fallback, and it keeps this helper agreeing with
    // deliveryTruth.pickupAddressFor, which never asked for a contact name.
    expect(pickup).toMatchObject({ name: 'Rahul All in one' });
  });
});

describe('a basket from two sellers is not offered same-day', () => {
  it('offers nothing same-day when two shops are in the basket', async () => {
    const options = await getDeliveryOptions([line(RAHUL), line(HOUSE)], address, false);
    expect(options.some((o) => o.id === 'same_day')).toBe(false);
    // And it never asked Borzo for a price it could not have honoured.
    expect(posted.some((p) => p.url.includes('calculate-order'))).toBe(false);
  });
});
