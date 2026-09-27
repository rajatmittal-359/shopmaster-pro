/**
 * The shop short link: www.shopmasterpro.in/charming-jewels
 *
 * WHY THIS IS TESTED (27 Sep 2026)
 *   The link lives at the ROOT, so a shop's slug and a page of the site share
 *   one namespace. Next gives a static route priority over a dynamic one, so
 *   a shop that managed to mint the slug "cart" would not break /cart - it
 *   would be quietly unreachable, with Settings showing the seller a link
 *   that goes somewhere else entirely. Nothing would throw and no test would
 *   fail; the seller would just find out from a customer.
 *
 *   The reserved list is the only thing standing between us and that, which
 *   makes it worth a test rather than a comment.
 */
import { describe, it, expect } from 'vitest';
import pkg from '../utils/sellerSlug.js';

const { slugify, isUsable } = pkg;

describe('slugify', () => {
  it('makes the link Rajat asked for', () => {
    expect(slugify('Charming Jewels')).toBe('charming-jewels');
  });

  it('drops punctuation rather than encoding it', () => {
    expect(slugify('Bloom Home & Beauty')).toBe('bloom-home-beauty');
    expect(slugify("Ravi's  Silks!!")).toBe('ravi-s-silks');
  });

  it('never leaves a hyphen hanging at either end', () => {
    expect(slugify('  --Nova Electronics--  ')).toBe('nova-electronics');
  });

  it('returns nothing for a name with no ASCII in it, rather than a stub', () => {
    // A Devanagari-only shop name has no usable slug. The caller must cope:
    // that shop keeps /sellers/<id>, which has always worked.
    expect(slugify('चार्मिंग ज्वेल्स')).toBe('');
  });

  it('stays within a length a person can read and type', () => {
    expect(slugify('A'.repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe('isUsable - the namespace guard', () => {
  it('refuses the site\'s own pages', () => {
    for (const taken of ['cart', 'checkout', 'admin', 'seller', 'sellers', 'products', 'login', 'help', 'shop']) {
      expect(isUsable(taken), `${taken} must stay ours`).toBe(false);
    }
  });

  it('refuses pages we have not built yet', () => {
    // Losing "blog" as a slug costs a shop nothing; losing /blog costs a rebuild.
    for (const later of ['blog', 'careers', 'pricing', 'search', 'track', 'offers']) {
      expect(isUsable(later)).toBe(false);
    }
  });

  it('refuses names a browser or crawler asks for on its own', () => {
    for (const special of ['robots', 'sitemap', 'favicon', '_next', 'well-known']) {
      expect(isUsable(special)).toBe(false);
    }
  });

  it('refuses shapes that are not slugs at all', () => {
    expect(isUsable('')).toBe(false);
    expect(isUsable('a')).toBe(false); // too short to mean anything
    expect(isUsable('-leading')).toBe(false);
    expect(isUsable('trailing-')).toBe(false);
    expect(isUsable('Has Capitals')).toBe(false);
    expect(isUsable('has spaces')).toBe(false);
    expect(isUsable('has/slash')).toBe(false);
    expect(isUsable('a'.repeat(41))).toBe(false);
  });

  it('allows an ordinary shop name', () => {
    for (const ok of ['charming-jewels', 'iyer-silks', 'rao-traders', 'all-in-one', 'shop24']) {
      expect(isUsable(ok), ok).toBe(true);
    }
  });

  it('a reserved word that slugifies from a real name is still refused', () => {
    // A shop genuinely called "Cart" - the name is fine, the slug is not.
    expect(isUsable(slugify('Cart'))).toBe(false);
  });
});
