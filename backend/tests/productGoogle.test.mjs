/**
 * Google's verdicts on one product, in one answer: is the page indexed, is
 * the item approved in Merchant Center, what did people type to find it.
 *
 * Read through the backend's service account; the seller sees only their own
 * product; nothing here is guessed - each field says "unknown" when Google
 * did not answer, never a made-up "fine".
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { productGoogleStatus } = require('../utils/google/productStatus');

const product = { _id: 'p1', slug: 'kundan-choker-abc', name: 'Kundan Choker' };

describe('productGoogleStatus', () => {
  it('combines index, merchant and query answers for one product', async () => {
    const out = await productGoogleStatus(product, {
      inspect: async (url) => ({ ok: true, verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawl: '2026-09-10T03:00:00Z', url }),
      merchantStatus: async (id) => ({ ok: true, id, status: 'approved', issues: [] }),
      queries: async ({ pageContains }) => ({ ok: true, rows: [{ query: 'kundan choker', page: `https://www.shopmasterpro.in/products/${pageContains.split('/').pop()}`, impressions: 40, clicks: 2, position: 17.9 }] }),
    });
    expect(out.index).toMatchObject({ indexed: true, state: 'Submitted and indexed' });
    expect(out.merchant).toMatchObject({ status: 'approved' });
    expect(out.queries[0].query).toBe('kundan choker');
  });

  it('says unknown, not fine, when Google does not answer', async () => {
    const out = await productGoogleStatus(product, {
      inspect: async () => ({ ok: false, reason: 'quota' }),
      merchantStatus: async () => ({ ok: false, reason: 'not connected' }),
      queries: async () => ({ ok: false, rows: [] }),
    });
    expect(out.index.indexed).toBe(null);
    expect(out.merchant.status).toBe('unknown');
    expect(out.queries).toEqual([]);
  });
});

describe('catalogueGoogleStatus', () => {
  const { catalogueGoogleStatus } = require('../utils/google/productStatus');
  const products = [
    { _id: 'p1', slug: 'a', name: 'A', sellerId: { name: 'Charming Jewels' } },
    { _id: 'p2', slug: 'b', name: 'B' },
    { _id: 'p3', slug: 'c', name: 'C' },
  ];

  it('lists every product with its index verdict and merchant status, and counts them', async () => {
    const out = await catalogueGoogleStatus(products, {
      inspect: async (url) => (url.endsWith('/a') ? { ok: true, verdict: 'PASS', coverageState: 'Submitted and indexed' } : { ok: true, verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed' }),
      merchantStatuses: async () => ({
        ok: true,
        byId: new Map([
          ['p1', { status: 'approved', issues: [] }],
          ['p2', { status: 'disapproved', issues: [{ code: 'image_link_broken', text: 'Invalid image' }] }],
        ]),
      }),
    });
    expect(out.rows.map((r) => r.index.indexed)).toEqual([true, false, false]);
    expect(out.rows[0].sellerName).toBe('Charming Jewels');
    expect(out.rows[1].merchant.issues[0].code).toBe('image_link_broken');
    expect(out.rows[2].merchant.status).toBe('not in feed');
    expect(out.summary).toEqual({ total: 3, indexed: 1, notIndexed: 2, indexUnknown: 0, approved: 1, disapproved: 1, pending: 0, notInFeed: 1 });
  });

  it('says unknown for every row when Google does not answer, never fine', async () => {
    const out = await catalogueGoogleStatus(products.map((p) => ({ ...p, _id: p._id + 'x', slug: p.slug + 'x' })), {
      inspect: async () => { throw new Error('quota'); },
      merchantStatuses: async () => ({ ok: false, reason: 'not connected', byId: new Map() }),
    });
    expect(out.rows.every((r) => r.index.indexed === null && r.merchant.status === 'unknown')).toBe(true);
    expect(out.summary.indexUnknown).toBe(3);
    expect(out.merchantReason).toBe('not connected');
  });
});

describe('the score', () => {
  it('rewards the things Google and shoppers actually read, to 100', () => {
    const { scoreListing } = require('../utils/listingScore');
    const empty = scoreListing({});
    expect(empty.score).toBe(0);
    const full = scoreListing({
      name: 'Green Kundan Choker Set for Weddings',
      images: ['a', 'b', 'c'],
      description: '<p>' + 'word '.repeat(95) + '</p><ul><li>one</li></ul>',
      category: 'x',
      color: 'Green',
      gender: 'female',
      ageGroup: 'adult',
      brand: 'Charming Jewels',
      weight: 60,
      tags: ['kundan', 'choker', 'bridal'],
      needsSize: false,
    });
    expect(full.score).toBe(100);
    expect(full.fixes).toEqual([]);
    const partial = scoreListing({ name: 'Choker', images: ['a'], color: 'Green' });
    expect(partial.score).toBeGreaterThan(0);
    expect(partial.fixes[0]).toHaveProperty('points');
    expect(partial.fixes[0]).toHaveProperty('text');
  });
});
