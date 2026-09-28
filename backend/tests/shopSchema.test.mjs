/**
 * The shop page's structured data (29 Sep 2026).
 *
 * WHY THIS IS WORTH A TEST AT ALL
 *   This is the only part of a shop page written for a machine, so it is the
 *   only part nobody notices when it goes wrong. A shop can look perfect and
 *   still be telling Google it is a website rather than a place in Jaipur.
 *
 *   The specific thing being defended: the website and the shop's Google
 *   Business Profile are matched on street, locality and postcode agreeing
 *   across the two. If those fields silently stop being emitted - or start
 *   being emitted for a seller who never asked to show their location - the
 *   page keeps rendering and nothing breaks until the shop quietly stops
 *   appearing in local results, months later, with no error anywhere.
 *
 * WHY IT LIVES IN THE BACKEND SUITE
 *   Same reason as formValidation and formSteps: `web/` has no test runner on
 *   this laptop and is not allowed to build here, so the shared, pure parts
 *   of the frontend are tested from the one runner that does work.
 */
import { describe, it, expect } from 'vitest';
import { buildShopSchema, isPlace, safeHref, shopPath } from '../../web/src/lib/shopSchema.js';

const SITE = 'https://www.shopmasterpro.in';

/** A shop with a door: location switched on, full pickup address. */
const PLACE = {
  id: '6a93cf88fbb4f39f4a6d5618',
  slug: 'charming-jewels',
  businessName: 'Charming Jewels',
  whatsapp: '918619404837',
  about: 'Artificial and fashion jewellery of every kind.',
  links: { googleBusiness: 'https://maps.google.com/?cid=13190293917526275064', instagram: 'https://www.instagram.com/charming_jewels706' },
  city: { city: 'Jaipur', state: 'Rajasthan' },
  legal: {
    name: 'Charming Jewels',
    address: 'C-13, Hari Marg, Jaipur Rajasthan 302019',
    gstin: '',
    enrolled: '',
    postal: { street: 'C-13, Hari Marg', locality: 'Jaipur', region: 'Rajasthan', postalCode: '302019' },
  },
  rating: { average: 5, reviews: 1 },
  productCount: 18,
};

/** A seller who ships from a flat and has kept their location switched off. */
const ONLINE_ONLY = {
  id: '6a93cf88fbb4f39f4a6d5619',
  businessName: 'Rahul All In One',
  links: {},
  city: null,
  legal: { name: 'Rahul Kumar', address: '', gstin: '', enrolled: '', postal: { street: '', locality: '', region: '', postalCode: '' } },
  rating: null,
  productCount: 4,
};

describe('a shop with a door', () => {
  it('is both a Store and an OnlineStore, because both are true', () => {
    expect(buildShopSchema(PLACE, SITE)['@type']).toEqual(['Store', 'OnlineStore']);
  });

  /*
   * The whole point of the change. A joined address line is what the page
   * prints for a person; these four separate fields are what a search engine
   * matches against the Business Profile.
   */
  it('emits the street, locality, region and postcode as separate fields', () => {
    expect(buildShopSchema(PLACE, SITE).address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'C-13, Hari Marg',
      addressLocality: 'Jaipur',
      addressRegion: 'Rajasthan',
      postalCode: '302019',
      addressCountry: 'IN',
    });
  });

  it('says it serves both its own city and the country it ships to', () => {
    expect(buildShopSchema(PLACE, SITE).areaServed).toEqual([
      { '@type': 'City', name: 'Jaipur' },
      { '@type': 'Country', name: 'India' },
    ]);
  });

  /*
   * `sameAs` is the claim "this website and that Google listing are one
   * business". It is the reason the Business Profile link is worth having in
   * the seller's settings at all.
   */
  it('joins the page to the shop’s own Google and Instagram profiles', () => {
    expect(buildShopSchema(PLACE, SITE).sameAs).toEqual([
      'https://maps.google.com/?cid=13190293917526275064',
      'https://www.instagram.com/charming_jewels706',
    ]);
  });

  it('publishes the WhatsApp number the page already shows, with a country prefix', () => {
    expect(buildShopSchema(PLACE, SITE).telephone).toBe('+918619404837');
  });

  it('uses the short link as the canonical url, not the id', () => {
    expect(buildShopSchema(PLACE, SITE).url).toBe('https://www.shopmasterpro.in/charming-jewels');
  });
});

describe('a seller who is not a place', () => {
  it('stays an OnlineStore only', () => {
    expect(buildShopSchema(ONLINE_ONLY, SITE)['@type']).toBe('OnlineStore');
    expect(isPlace(ONLINE_ONLY)).toBe(false);
  });

  /*
   * The one that would be a real harm. `pickupAddress` is a courier contact.
   * A seller who never switched their location on must not have their home
   * address published as a shopfront because a schema builder found a street
   * line on the document.
   */
  it('publishes no address at all, and no telephone', () => {
    const schema = buildShopSchema(ONLINE_ONLY, SITE);
    expect(schema.address).toBeUndefined();
    expect(schema.telephone).toBeUndefined();
    expect(schema.areaServed).toBeUndefined();
  });

  it('is not made a Store by a street line alone when the location is off', () => {
    const hidden = { ...ONLINE_ONLY, legal: { ...ONLINE_ONLY.legal, postal: { street: '12, Some Lane', locality: 'Jaipur', region: 'Rajasthan', postalCode: '302019' } } };
    expect(isPlace(hidden)).toBe(false);
    expect(buildShopSchema(hidden, SITE).address).toBeUndefined();
  });

  it('falls back to the id url when the shop has no short link', () => {
    expect(shopPath(ONLINE_ONLY)).toBe('/sellers/6a93cf88fbb4f39f4a6d5619');
  });
});

describe('what may go in sameAs', () => {
  it.each(['javascript:alert(1)', 'data:text/html,x', 'not a url', ''])('drops %j', (bad) => {
    expect(safeHref(bad)).toBeNull();
  });

  it('leaves the key out entirely rather than emitting an empty list', () => {
    const noLinks = { ...PLACE, links: { instagram: 'javascript:alert(1)' } };
    expect(buildShopSchema(noLinks, SITE)).not.toHaveProperty('sameAs');
  });
});

describe('what is never claimed', () => {
  /*
   * Hours and a geo point are absent on purpose: the platform holds neither.
   * Hours that are wrong send somebody to a closed door, which is worse than
   * saying nothing - and "open at the time of the search" is a real ranking
   * factor, so a guess here would be a guess that matters.
   */
  it('claims no opening hours and no coordinates', () => {
    const schema = buildShopSchema(PLACE, SITE);
    expect(schema.openingHoursSpecification).toBeUndefined();
    expect(schema.geo).toBeUndefined();
  });

  it('omits taxID for a shop with no GSTIN rather than sending an empty one', () => {
    expect(buildShopSchema(PLACE, SITE)).not.toHaveProperty('taxID');
  });

  it('always names the platform as the parent, on every shop', () => {
    for (const seller of [PLACE, ONLINE_ONLY]) {
      expect(buildShopSchema(seller, SITE).parentOrganization).toEqual({ '@type': 'Organization', name: 'ShopMaster Pro', url: SITE });
    }
  });
});
