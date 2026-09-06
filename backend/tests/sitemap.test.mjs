/**
 * The sitemap: what Google is told exists.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   The sitemap was a file written by a script somebody had to remember to run.
 *   Nobody did. On 7 September 2026 the deployed file listed 92 URLs and was
 *   dated 30 August, while Google's copy was dated 1 JANUARY and listed six.
 *   The catalogue had 93 live pages. Nothing failed, nothing warned, and the
 *   shop simply was not in the index - two pages of ninety-three.
 *
 *   It is now generated from the database on request, by the same builder the
 *   script calls, so the two can never give different answers.
 *
 * The rules being defended:
 *   1. only pages a stranger can actually use - no dashboards, no checkout
 *   2. only products that are live: active, in stock, not deleted
 *   3. every URL absolute and on the customer's domain, never the API's
 *   4. slugs escaped - one ampersand makes the whole file unparseable
 *   5. a failure serves 503, never an empty but valid sitemap
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const Product = require('../models/Product');
const Category = require('../models/Category');
const { buildSitemap } = require('../utils/buildSitemap');
const { sitemap } = require('../controllers/sitemapController');

const originals = {};

/** Product.find(...).select(...).lean() and Category's identical chain. */
const chain = (rows) => ({
  select: () => ({ lean: async () => rows }),
});

const CATEGORIES = [
  { _id: 'c1', slug: 'necklaces-and-pendants', updatedAt: new Date('2026-08-30') },
  { _id: 'c2', slug: 'rings', updatedAt: new Date('2026-09-01') },
];

const PRODUCTS = [
  { _id: 'p1', slug: 'antique-gold-temple-necklace', updatedAt: new Date('2026-09-05') },
];

beforeEach(() => {
  originals.productFind = Product.find;
  originals.categoryFind = Category.find;
  originals.browsable = Category.getBrowsableIds;

  Product.find = vi.fn(() => chain(PRODUCTS));
  Category.find = vi.fn(() => chain(CATEGORIES));
  Category.getBrowsableIds = vi.fn(async () => ['c1', 'c2']);
});

afterEach(() => {
  Product.find = originals.productFind;
  Category.find = originals.categoryFind;
  Category.getBrowsableIds = originals.browsable;
});

describe('what goes into the sitemap', () => {
  it('lists the home page, the shop, every browsable category and every live product', async () => {
    const { xml, counts } = await buildSitemap();

    expect(counts).toMatchObject({ static: 2, categories: 2, products: 1, total: 5 });
    expect(xml).toContain('<loc>https://www.shopmasterpro.in/</loc>');
    expect(xml).toContain('<loc>https://www.shopmasterpro.in/shop</loc>');
    expect(xml).toContain('/products/antique-gold-temple-necklace');
  });

  it('never offers Google a page it cannot use', async () => {
    const { xml } = await buildSitemap();

    // An earlier sitemap listed these. Asking Google to index a checkout is
    // asking it to index a page that means nothing without a basket.
    for (const path of ['/login', '/register', '/customer/', '/seller/', '/admin/', '/checkout']) {
      expect(xml).not.toContain(path);
    }
  });

  it('asks the database only for products that are genuinely live', async () => {
    await buildSitemap();

    // A page for a sold-out or deleted product answers "unavailable", which
    // Google reads as a soft 404 - and a sitemap full of them is one Google
    // learns to trust less.
    expect(Product.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        isDeleted: { $ne: true },
        stock: { $gt: 0 },
      })
    );
  });

  it('points at the shop the customer visits, not at the API', async () => {
    const { xml } = await buildSitemap();

    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBe(5);
    for (const loc of locs) {
      expect(loc.startsWith('https://www.shopmasterpro.in')).toBe(true);
    }
    expect(xml).not.toMatch(/onrender\.com/);
  });

  it('escapes a slug that would otherwise break the whole file', async () => {
    Category.find = vi.fn(() =>
      chain([{ _id: 'c1', slug: 'bangles&bracelets', updatedAt: new Date('2026-08-30') }])
    );

    const { xml } = await buildSitemap();

    // One raw ampersand and no crawler can parse a single URL in the document.
    expect(xml).toContain('bangles&amp;bracelets');
    expect(xml).not.toMatch(/bangles&bracelets/);
  });

  it('dates each entry so a crawler knows what has moved', async () => {
    const { xml } = await buildSitemap();

    expect(xml).toContain('<lastmod>2026-09-05</lastmod>');
  });
});

describe('serving it', () => {
  const fakeRes = () => {
    const res = {
      headers: {},
      body: null,
      code: 200,
      set(k, v) {
        this.headers[k] = v;
        return this;
      },
      status(c) {
        this.code = c;
        return this;
      },
      send(b) {
        this.body = b;
        return this;
      },
    };
    return res;
  };

  it('serves XML a crawler will accept', async () => {
    const res = fakeRes();

    await sitemap({}, res);

    expect(res.code).toBe(200);
    expect(res.headers['Content-Type']).toMatch(/application\/xml/);
    expect(res.body).toContain('<urlset');
  });

  it('refuses with 503 rather than claiming the shop has no pages', async () => {
    Category.getBrowsableIds = vi.fn(async () => {
      throw new Error('database unreachable');
    });
    const res = fakeRes();

    await sitemap({}, res);

    // A valid but EMPTY sitemap tells Google the site has nothing, and it can
    // drop pages it has already indexed. A 503 just means "come back later".
    expect(res.code).toBe(503);
    expect(res.body).not.toContain('<urlset');
  });
});
