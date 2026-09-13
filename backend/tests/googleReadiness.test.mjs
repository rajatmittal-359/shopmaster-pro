/**
 * The Google coach's facts half (plan 2.32): words real people typed, with
 * their source and count - Google first, our shoppers second, the synonym
 * family last; and the shop-level readiness list. No model, no network.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { keywordEvidence, shopReadiness, tokens } = require('../utils/googleReadiness');
const SearchLog = require('../models/SearchLog');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const insights = require('../controllers/searchInsightsController');

describe('tokens', () => {
  it('drops stop words and punctuation, keeps Hindi', () => {
    expect(tokens('Oxidised Silver Jhumka Earrings for Women - new!')).toEqual(['oxidised', 'silver', 'jhumka', 'earrings', 'women']);
    expect(tokens('लाल झुमका ki')).toEqual(['लाल', 'झुमका']);
  });
});

describe('keywordEvidence', () => {
  const orig = { agg: SearchLog.aggregate, gsc: insights.sellerGoogleQueries };
  afterEach(() => {
    SearchLog.aggregate = orig.agg;
    insights.sellerGoogleQueries = orig.gsc;
  });

  it('orders Google > our shoppers > family, carries counts and notes, never repeats the product\'s own words', async () => {
    insights.sellerGoogleQueries = vi.fn(async () => ({ ok: true, rows: [{ query: 'silver jhumka price', impressions: 120, clicks: 4, page: '/products/x' }], site: [{ query: 'kundan set', impressions: 900, clicks: 9 }, { query: 'oxidised earrings', impressions: 40, clicks: 1 }] }));
    SearchLog.aggregate = vi.fn(async () => [{ _id: 'oxidised jhumka', count: 14, results: 3 }, { _id: 'lal chudi', count: 9, results: 0 }, { _id: 'jhumki', count: 5, results: 0 }]);
    const r = await keywordEvidence({ sellerId: 's1', name: 'Oxidised Silver Jhumka Earrings', categoryName: 'Earrings', tags: [] });
    expect(r.google).toBe(true);
    const by = Object.fromEntries(r.words.map((w) => [w.word, w]));
    expect(by['silver jhumka price']).toMatchObject({ source: 'google', count: 120 });
    expect(by['oxidised earrings']).toMatchObject({ source: 'google' });
    expect(by['kundan set']).toBeUndefined(); // not about this product
    expect(by['oxidised jhumka']).toMatchObject({ source: 'shop', count: 14 });
    expect(by['jhumki']).toMatchObject({ source: 'shop' });
    expect(by['jhumki'].note).toMatch(/found nothing/);
    expect(by['lal chudi']).toBeUndefined(); // bangles, not earrings
    expect(by['bali']).toMatchObject({ source: 'family' });
    expect(by['jhumka']).toBeUndefined(); // already in the title
    const order = r.words.map((w) => w.source);
    expect(order.indexOf('family')).toBeGreaterThan(order.lastIndexOf('google'));
  });

  it('works with no Google and no log - the family alone', async () => {
    insights.sellerGoogleQueries = vi.fn(async () => ({ ok: false, reason: 'not configured' }));
    SearchLog.aggregate = vi.fn(async () => []);
    const r = await keywordEvidence({ sellerId: 's1', name: 'Payal', tags: [] });
    expect(r.google).toBe(false);
    expect(r.words.map((w) => w.word)).toEqual(expect.arrayContaining(['anklet', 'pajeb']));
    expect(r.words.every((w) => w.source === 'family')).toBe(true);
  });
});

describe('shopReadiness', () => {
  const orig = { pf: Product.find, sf: Seller.findOne };
  afterEach(() => {
    Product.find = orig.pf;
    Seller.findOne = orig.sf;
  });
  it('lists the weak products first with their first fix, and the near-me facts', async () => {
    Product.find = vi.fn(() => ({ select: () => ({ lean: async () => [
      { _id: 'p1', name: 'Oxidised silver jhumka earrings for women', slug: 'a', images: ['1', '2', '3'], description: '<p>' + 'word '.repeat(80) + '</p><ul><li>x</li></ul>', category: 'c', color: 'silver', gender: 'women', ageGroup: 'adult', brand: 'CJ', weight: 50, tags: ['a', 'b', 'c'], faqs: [{ q: 'a', a: 'b' }, { q: 'c', a: 'd' }] },
      { _id: 'p2', name: 'Ring', slug: 'b', images: [], description: '', tags: [], faqs: [] },
    ] }) }));
    Seller.findOne = vi.fn(() => ({ select: () => ({ lean: async () => ({ about: 'Handmade in Jaipur since 1998', showLocation: true, pickupAddress: { city: 'Jaipur', pincode: '302019' }, links: { googleBusiness: '' } }) }) }));
    const r = await shopReadiness('s1');
    expect(r.products.total).toBe(2);
    expect(r.products.weak).toHaveLength(1);
    expect(r.products.weak[0]).toMatchObject({ name: 'Ring' });
    expect(r.products.weak[0].topFix.length).toBeGreaterThan(10);
    expect(r.nearMe).toEqual({ showLocation: true, cityInAbout: true, pickupSet: true, gbpLinked: false });
    expect(r.faqsMissing).toBe(1);
  });
});
