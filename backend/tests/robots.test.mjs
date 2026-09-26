/**
 * robots.txt — what the crawler may walk, and what it must not.
 *
 * WHY THIS EXISTS (26 Sep 2026)
 *   The Caddy log on the box showed Googlebot and GPTBot working through
 *   combinations of the shop's colour filter - `?color=Teal,Maroon,Grey,…` -
 *   one after another. Six filters that each take several values is a
 *   near-infinite URL space. Search Console reports 2 pages indexed; every
 *   request spent on a colour permutation is one not spent on a product.
 *
 *   Those pages were already `noindex, follow` with a canonical to the clean
 *   URL, so nothing was indexed wrongly. But noindex does not stop the crawl -
 *   the crawler must fetch the page to read the tag. Blocking the valueless
 *   combinations in robots.txt is Google's own advice for faceted navigation.
 *
 *   The danger in that fix is over-blocking: hide `category` or `page` and the
 *   catalogue stops being discoverable. That is the real reason this test
 *   exists - the allow side matters more than the disallow side.
 */
import { describe, it, expect, vi } from 'vitest';

/*
 * robots.js reads the site URL once, at module load, so each host needs a
 * fresh evaluation. `resetModules` with a STATIC import path - a variable one
 * cannot be analysed by the bundler.
 */
const load = async (site) => {
  process.env.NEXT_PUBLIC_SITE_URL = site;
  vi.resetModules();
  const mod = await import('../../web/src/app/robots.js');
  return mod.default();
};

const LIVE = 'https://www.shopmasterpro.in';

/** Does this robots.txt rule match this URL? `*` is any run, `$` is the end. */
const matches = (pattern, url) => {
  const rx = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\\\$$/, '$')
  );
  return rx.test(url);
};
const blocked = (rules, url) => rules.disallow.some((p) => matches(p, url));

describe('the crawler is kept out of the facet trap', () => {
  it('blocks the colour permutations the bots were actually walking', async () => {
    const { rules } = await load(LIVE);
    // verbatim from the 26 Sep Caddy log
    expect(blocked(rules[0], '/shop?color=Teal%2CMaroon%2CGrey%2CKhaki%2CBlue%2CSilver')).toBe(true);
    expect(blocked(rules[0], '/shop?color=Multicolor%2CGreen%2CPurple')).toBe(true);
  });

  it('blocks the other five filters, the template facets, and search', async () => {
    const { rules } = await load(LIVE);
    for (const url of [
      '/shop?size=M',
      '/shop?minRating=4',
      '/shop?minPrice=100',
      '/shop?maxPrice=5000',
      '/shop?sort=price-asc',
      '/shop?attr.plating=Gold+Plated',
      '/shop?search=jhumka',
    ]) {
      expect(blocked(rules[0], url), url).toBe(true);
    }
  });

  it("blocks Next's own prefetch payload, which is not a page", async () => {
    const { rules } = await load(LIVE);
    // also verbatim from the log - Googlebot was fetching these by the hundred
    expect(blocked(rules[0], '/shop?category=computer-accessories&_rsc=4CEEjZVs8gMj_MrP')).toBe(true);
  });
});

describe('and is NOT kept out of the catalogue', () => {
  it('leaves the pages that earn their crawl alone', async () => {
    const { rules } = await load(LIVE);
    for (const url of [
      '/',
      '/shop',
      '/shop?category=jewellery',
      '/shop?category=jewellery&page=2',
      '/products/silver-toe-ring-a1b2c3',
      '/sellers/6890f2c1d4e5a6b7c8d9e0f1',
      '/how-we-rank',
    ]) {
      expect(blocked(rules[0], url), url).toBe(false);
    }
  });

  it('still hides the private pages, and still points at the live sitemap', async () => {
    const { rules, sitemap } = await load(LIVE);
    expect(blocked(rules[0], '/checkout')).toBe(true);
    expect(blocked(rules[0], '/seller/products')).toBe(true);
    expect(sitemap).toBe(`${LIVE}/sitemap.xml`);
  });
});

describe('a preview host stays out of the index entirely', () => {
  it('disallows everything when the host is not shopmasterpro.in', async () => {
    const { rules } = await load('https://shopmaster-pro.vercel.app');
    expect(rules[0].disallow).toBe('/');
    expect(rules[0].allow).toBeUndefined();
  });
});
