/**
 * IndexNow (plan 2.37c): one batched POST with host, key and key location;
 * off without the key; a failure is logged, never thrown.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const indexNow = require('../utils/indexNow');

describe('indexNow', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    indexNow._reset();
    process.env.INDEXNOW_KEY = 'abc123';
    process.env.SITE_URL = 'https://www.shopmasterpro.in';
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.INDEXNOW_KEY;
    delete process.env.SITE_URL;
    vi.restoreAllMocks();
  });

  it('off without the key - nothing is called', async () => {
    delete process.env.INDEXNOW_KEY;
    global.fetch = vi.fn();
    expect(await indexNow.ping('/products/x', { now: true })).toMatchObject({ ok: false, reason: /INDEXNOW_KEY/ });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('batches paths into one POST with host, key, key location and absolute URLs, deduped', async () => {
    global.fetch = vi.fn(async () => ({ status: 202, text: async () => '' }));
    indexNow.ping(['/products/kundan-set', '/shop']);
    indexNow.ping('/shop');
    const r = await indexNow.ping('https://www.shopmasterpro.in/sellers/u1', { now: true });
    expect(r).toMatchObject({ ok: true, sent: 3, status: 202 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({
      host: 'www.shopmasterpro.in',
      key: 'abc123',
      keyLocation: 'https://www.shopmasterpro.in/abc123.txt',
      urlList: ['https://www.shopmasterpro.in/products/kundan-set', 'https://www.shopmasterpro.in/shop', 'https://www.shopmasterpro.in/sellers/u1'],
    });
  });

  it('a refusal is logged with the status and never thrown', async () => {
    global.fetch = vi.fn(async () => ({ status: 422, text: async () => 'Invalid key' }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await indexNow.ping('/shop', { now: true });
    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(err.mock.calls[0].join(' ')).toMatch(/422 Invalid key/);
  });

  it('productPaths names the product page, the shop listing and the seller page', () => {
    expect(indexNow.productPaths({ slug: 'jhumka-1', sellerId: 'u9' })).toEqual(['/products/jhumka-1', '/shop', '/sellers/u9']);
    expect(indexNow.productPaths({})).toEqual(['/shop']);
  });
});
