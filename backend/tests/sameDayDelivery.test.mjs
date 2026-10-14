/**
 * Same-day delivery as a second option at checkout.
 *
 * The rules that have to hold:
 *
 *   1. standard delivery is always offered
 *   2. same-day is offered only where a rider will genuinely take it
 *   3. the courier is not even called for an out-of-town address
 *   4. if the hyperlocal courier is down, the customer simply does not see the
 *      option - a courier outage must never block a sale
 *   5. the PRICE is always re-quoted on the server; the browser sends an option
 *      id and nothing else
 *   6. a free-shipping basket stays free on standard, but pays for same-day
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const shiprocket = require('../utils/shiprocketService');
const borzo = require('../utils/borzo');
const {
  getDeliveryOptions,
  priceDeliveryOption,
  describeArrival,
} = require('../utils/shipping');

/** Same first three digits as the pickup pincode set in tests/setup.mjs. */
const JAIPUR = {
  label: 'Home',
  street: 'Malviya Nagar',
  city: 'Jaipur',
  state: 'Rajasthan',
  zipCode: '302017',
  phoneNumber: '+919876543210',
};

const BENGALURU = { ...JAIPUR, city: 'Bengaluru', zipCode: '560038' };

const line = (weight, quantity, freeShipping = false) => ({
  quantity,
  productId: { weight, freeShipping },
});

const CART = [line(0.5, 1)];

let originals;
let borzoCalls;

beforeEach(() => {
  originals = {
    getShippingRate: shiprocket.getShippingRate,
    quoteSameDay: borzo.quoteSameDay,
  };
  borzoCalls = [];

  shiprocket.getShippingRate = vi.fn(async () => ({
    data: {
      available_courier_companies: [
        { courier_name: 'Xpressbees', freight_charge: 71, cod_charges: 30 },
      ],
    },
  }));

  borzo.quoteSameDay = vi.fn(async (address, weightKg) => {
    borzoCalls.push({ zipCode: address.zipCode, weightKg });
    return {
      provider: 'borzo',
      price: 102,
      // Relative, not a fixed date: a hard-coded one would make this suite
      // start failing the day after it was written.
      arrivalBy: new Date(Date.now() + 2 * 3600000),
    };
  });
});

afterEach(() => {
  shiprocket.getShippingRate = originals.getShippingRate;
  borzo.quoteSameDay = originals.quoteSameDay;
});

describe('what a customer is offered', () => {
  it('offers standard and same-day inside the city', async () => {
    const options = await getDeliveryOptions(CART, JAIPUR, false);

    expect(options.map((o) => o.id)).toEqual(['standard', 'same_day']);
    expect(options[0].price).toBe(71);
    expect(options[1].price).toBe(102);
  });

  it('offers only standard out of town', async () => {
    const options = await getDeliveryOptions(CART, BENGALURU, false);

    expect(options.map((o) => o.id)).toEqual(['standard']);
  });

  it('does not even call the hyperlocal courier out of town', async () => {
    await getDeliveryOptions(CART, BENGALURU, false);

    // A pointless network call on every out-of-town checkout is latency the
    // customer pays for and the courier would refuse anyway.
    expect(borzoCalls).toHaveLength(0);
  });

  it('tells the customer when it will actually arrive', async () => {
    const [, sameDay] = await getDeliveryOptions(CART, JAIPUR, false);

    // Taken from the courier's own answer rather than a cut-off this codebase
    // invents, so the promise is one the courier has actually made. Whether it
    // reads Today or Tomorrow depends on the clock, which is the point.
    expect(sameDay.etaText).toMatch(/^(Today|Tomorrow) by /);
    expect(sameDay.arrivalBy).toBeInstanceOf(Date);
  });

  it('passes the real basket weight to the courier', async () => {
    await getDeliveryOptions([line(0.5, 3)], JAIPUR, false);
    expect(borzoCalls[0].weightKg).toBe(1.5);
  });
});

/*
 * THE WALLET (19 Sep 2026, deleted 12 Oct 2026)
 *
 * There used to be a pre-flight check here: read the Borzo balance, and if it
 * could not pay for this delivery, do not offer same-day at all. Two tests
 * guarded it and both passed - because both replaced `borzo.canAfford` with a
 * mock that returned `false`. The real function never can.
 *
 * The production token arrived on 12 Oct and the first live call settled it.
 * `canAfford` read `client.balance_amount`; Borzo's API 1.8 has no such field.
 * Their own documentation describes GET /client as "client info with allowed
 * payment methods", and the live account returns exactly that - name, phone,
 * email, legal_type, allowed_payment_methods - with ₹100 in the wallet and no
 * amount anywhere in the payload. Checked again after topping up, in case the
 * field were simply omitted at zero: still absent. There is no other endpoint
 * (/bank-cards, /client, /orders, /courier, calculate-order, create-order,
 * cancel-order, edit-order, labels is the whole of 1.8) and no other version
 * (1.9, 2.0, 2.1, 3.0 all answer `invalid_api_version`).
 *
 * So the check could not be fixed, only deleted. What replaced it is what the
 * market does: Flipkart sends a missed quick-delivery to a support agent
 * rather than refunding by itself, and Swiggy's refund page says every case is
 * assessed individually and never without the merchant's permission. Neither
 * cancels the order and neither refunds automatically. Ours records the
 * refusal on the order, names the courier whose wallet is empty (that was the
 * second bug - the sentence said Shiprocket whatever had refused), and puts it
 * in front of the seller and the admin.
 *
 * The real cure is not a better guess at the balance. It is `payment_method:
 * "bank_card"` with a `bank_card_id` from GET /bank-cards, both documented in
 * API 1.8, which removes the wallet from the path entirely. No card is bound
 * to the account yet - see WHAT-IS-LEFT.
 */
describe('the wallet cannot be read before the booking (12 Oct 2026)', () => {
  it('offers same-day on the quote alone, because there is no balance to ask for', async () => {
    const options = await getDeliveryOptions(CART, JAIPUR, false);
    expect(options.map((o) => o.id)).toEqual(['standard', 'same_day']);
  });

  it('no longer exposes a balance check that could only ever answer "unknown"', () => {
    expect(borzo.canAfford).toBeUndefined();
    expect(borzo.balance).toBeUndefined();
  });
});

describe('the courier being unavailable is not the customer\'s problem', () => {
  it('hides same-day when the courier declines the address', async () => {
    borzo.quoteSameDay = vi.fn(async () => null);

    const options = await getDeliveryOptions(CART, JAIPUR, false);

    expect(options.map((o) => o.id)).toEqual(['standard']);
  });

  it('still sells the order at standard delivery', async () => {
    borzo.quoteSameDay = vi.fn(async () => null);

    const priced = await priceDeliveryOption(CART, JAIPUR, false, 'same_day');

    // Asking for an option that is no longer available must fall back, not fail.
    expect(priced.deliveryOption).toBe('standard');
    expect(priced.shippingCharges).toBe(71);
  });

  it('is not configured at all without a token, and that is fine', async () => {
    borzo.quoteSameDay = originals.quoteSameDay;
    const token = process.env.BORZO_API_TOKEN;
    delete process.env.BORZO_API_TOKEN;

    const options = await getDeliveryOptions(CART, JAIPUR, false);

    expect(options.map((o) => o.id)).toEqual(['standard']);
    if (token) process.env.BORZO_API_TOKEN = token;
  });
});

describe('the price is decided by the server, never the browser', () => {
  it('charges the courier price for the option chosen', async () => {
    const standard = await priceDeliveryOption(CART, JAIPUR, false, 'standard');
    const sameDay = await priceDeliveryOption(CART, JAIPUR, false, 'same_day');

    expect(standard.shippingCharges).toBe(71);
    expect(sameDay.shippingCharges).toBe(102);
  });

  it('ignores an unknown option instead of trusting it', async () => {
    const priced = await priceDeliveryOption(CART, JAIPUR, false, 'free_please');

    expect(priced.deliveryOption).toBe('standard');
    expect(priced.shippingCharges).toBe(71);
  });

  it('records which courier actually carries the order', async () => {
    const standard = await priceDeliveryOption(CART, JAIPUR, false, 'standard');
    const sameDay = await priceDeliveryOption(CART, JAIPUR, false, 'same_day');

    expect(standard.shippingProvider).toBe('shiprocket');
    expect(sameDay.shippingProvider).toBe('borzo');
  });

  it('keeps the arrival promise only for same-day', async () => {
    const standard = await priceDeliveryOption(CART, JAIPUR, false, 'standard');
    const sameDay = await priceDeliveryOption(CART, JAIPUR, false, 'same_day');

    expect(standard.arrivalBy).toBeNull();
    expect(sameDay.arrivalBy).toBeInstanceOf(Date);
  });
});

describe('free shipping and same-day', () => {
  const FREE_CART = [line(0.5, 1, true)];

  it('keeps standard delivery free', async () => {
    const [standard] = await getDeliveryOptions(FREE_CART, JAIPUR, false);

    expect(standard.price).toBe(0);
    expect(standard.etaText).toMatch(/free/i);
  });

  it('still charges for same-day', async () => {
    const options = await getDeliveryOptions(FREE_CART, JAIPUR, false);
    const sameDay = options.find((o) => o.id === 'same_day');

    // The seller promised free delivery, not a same-day rider. That is a real
    // extra cost nobody agreed to absorb.
    expect(sameDay.price).toBe(102);
  });

  it('a free basket taking same-day is not marked free', async () => {
    const priced = await priceDeliveryOption(FREE_CART, JAIPUR, false, 'same_day');

    expect(priced.freeShipping).toBe(false);
    expect(priced.shippingCharges).toBe(102);
  });
});

describe('what the customer is told about timing', () => {
  const hoursFromNow = (h) => new Date(Date.now() + h * 3600000);

  it('says Today only when the arrival really is today', () => {
    const now = new Date();
    const laterToday = new Date(now);
    laterToday.setHours(23, 30, 0, 0);

    // Only meaningful if there is still time left in the day to test with.
    if (laterToday > now) {
      expect(describeArrival(laterToday)).toMatch(/^Today by /);
    }
  });

  it('says Tomorrow rather than lying about Today', () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    // An order placed late at night is quoted for the next day. Calling that
    // "Today by 10am" would be a promise the courier never made.
    expect(describeArrival(tomorrow)).toMatch(/^Tomorrow by /);
  });

  it('names the date when it is further out', () => {
    const text = describeArrival(hoursFromNow(24 * 4));

    expect(text).toMatch(/^By /);
    expect(text).not.toMatch(/Today|Tomorrow/);
  });

  it('falls back to Today when the courier gave no time', () => {
    expect(describeArrival(null)).toBe('Today');
  });
});

/*
 * THE SAME QUESTION, ASKED EARLIER (15 Oct 2026)
 *
 *   Same-day is decided at checkout, which is the last place a shopper can be
 *   persuaded. The decision they are actually making happens on the PRODUCT
 *   page - Amazon and Flipkart both put the delivery promise beside the price
 *   for exactly that reason - and ours said nothing about it there.
 *
 *   Everything that can be known without asking Borzo is cheap: is the item on
 *   a shelf, does the seller have a pickup, is the PIN local, is the admin's
 *   switch on. That much can be answered on a product page with no courier
 *   call at all. Only the PRICE needs Borzo, and a product page does not
 *   quote a price.
 *
 *   So the four cheap gates move into one helper that the checkout and the
 *   product page both import, because a rule in two files becomes two rules.
 */
describe('what can be known about same-day before calling the courier', () => {
  const { sameDayPossible } = require('../utils/shipping');
  const ok = {
    pickupPoint: { address: 'Shop, Jaipur', phone: '9', name: 'Shop' },
    pickupPin: '302019',
    deliveryPincode: '302001',
    madeToOrder: false,
    sameDayEnabled: true,
  };

  it('says yes when the shelf, the pickup, the city and the switch all agree', () => {
    expect(sameDayPossible(ok)).toBe(true);
  });

  it('says no for a made-to-order item - a rider cannot collect what is not made', () => {
    expect(sameDayPossible({ ...ok, madeToOrder: true })).toBe(false);
  });

  it('says no when the seller has no pickup on file, rather than sending the rider elsewhere', () => {
    expect(sameDayPossible({ ...ok, pickupPoint: null })).toBe(false);
  });

  it('says no for another city', () => {
    expect(sameDayPossible({ ...ok, deliveryPincode: '110001' })).toBe(false);
  });

  it('obeys the admin switch, which is the same rule COD follows', () => {
    expect(sameDayPossible({ ...ok, sameDayEnabled: false })).toBe(false);
  });

  it('treats an unset switch as on - the default is the feature working', () => {
    expect(sameDayPossible({ ...ok, sameDayEnabled: undefined })).toBe(true);
  });
});
