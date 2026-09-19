/**
 * Meta Conversions API (19 Sep 2026): the server-side Purchase leaves only
 * with the consent cookie, carries hashed identifiers and the order's id as
 * event_id (so the browser pixel's copy is deduped), and never throws.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const capi = require('../utils/metaCapi');

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const order = { _id: '66f1a0000000000000000001', orderNumber: 'SMP-2609-0042', totalAmount: 2499, shippingAddressId: '66f1a0000000000000000009', items: [{ productId: 'p1', quantity: 2 }, { productId: { _id: 'p2' }, quantity: 1, status: 'cancelled' }] };
const user = { _id: 'u1', email: '  Rani@Example.com ' };
const address = { phoneNumber: '98290 12345' };
const req = (cookie = 'smp_consent=all; _fbp=fb.1.1.2; smp_at=x') => ({ headers: { cookie, 'user-agent': 'Chrome/1' }, ip: '49.36.1.1' });

describe('meta capi', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.META_PIXEL_ID = '123';
    process.env.META_CAPI_TOKEN = 'tok';
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.META_PIXEL_ID;
    delete process.env.META_CAPI_TOKEN;
    delete process.env.META_TEST_EVENT_CODE;
    vi.restoreAllMocks();
  });

  it('off without the keys; off without "Accept all" - nothing is called either way', async () => {
    global.fetch = vi.fn();
    delete process.env.META_CAPI_TOKEN;
    expect(await capi.purchase({ order, user, address, req: req() })).toMatchObject({ ok: false, reason: /not set/ });
    process.env.META_CAPI_TOKEN = 'tok';
    expect(await capi.purchase({ order, user, address, req: req('smp_consent=necessary') })).toMatchObject({ ok: false, reason: 'no consent' });
    expect(await capi.purchase({ order, user, address, req: req('') })).toMatchObject({ ok: false, reason: 'no consent' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('the payload: hashed email/phone/user id, the browser cookies, the order id as event_id, cancelled lines left out', () => {
    const p = capi.purchasePayload({ order, user, address, req: req(), now: 1_700_000_000_000 });
    expect(p).toMatchObject({ event_name: 'Purchase', event_time: 1_700_000_000, event_id: order._id, action_source: 'website' });
    expect(p.user_data).toEqual({
      em: [sha('rani@example.com')],
      ph: [sha('919829012345')],
      external_id: [sha('u1')],
      client_ip_address: '49.36.1.1',
      client_user_agent: 'Chrome/1',
      fbp: 'fb.1.1.2',
    });
    expect(p.custom_data).toEqual({ currency: 'INR', value: 2499, content_type: 'product', content_ids: ['p1'], num_items: 2, order_id: 'SMP-2609-0042' });
    expect(JSON.stringify(p)).not.toMatch(/rani|9829/i);
  });

  it('sends one POST with the token in the body (not the URL), the test code when set, and reports a 4xx without throwing', async () => {
    process.env.META_TEST_EVENT_CODE = 'TEST1';
    global.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const r = await capi.purchase({ order, user, address, req: req() });
    expect(r).toEqual({ ok: true, eventId: order._id });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/events');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ access_token: 'tok', test_event_code: 'TEST1' });
    expect(body.data[0].event_id).toBe(order._id);

    global.fetch = vi.fn(async () => ({ ok: false, status: 400, text: async () => '{"error":"bad token"}' }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await capi.purchase({ order, user, address, req: req() })).toMatchObject({ ok: false, status: 400 });
    expect(err).toHaveBeenCalled();

    global.fetch = vi.fn(async () => { throw new Error('offline'); });
    expect(await capi.purchase({ order, user, address, req: req() })).toMatchObject({ ok: false, reason: 'offline' });
  });

  it('phones: ten digits get the country code, a +91 stays one number', () => {
    expect(capi.normPhone('98290 12345')).toBe('919829012345');
    expect(capi.normPhone('+91-9829012345')).toBe('919829012345');
    expect(capi.normPhone('')).toBe('');
  });
});
