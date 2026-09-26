/**
 * "Paste the link, get the listing" (24 Sep 2026).
 *
 * The rules this defends, each one learned the hard way against real Amazon
 * and Meesho pages on the day it was built:
 *
 *   1. the pictures come in BIG. Both sites put thumbnails in the markup -
 *      Amazon 40 pixels wide, Meesho 360 - and the full size is the same URL
 *      with the size token changed.
 *   2. one photograph, not five copies of it at five sizes.
 *   3. navigation sprites, tracking pixels and payment badges are not photos.
 *   4. the model may only choose from OUR candidate list. A URL it invents
 *      must never make the server go and fetch something.
 *   5. the page handed to the model is the part around the price, not the
 *      first six thousand characters - on Meesho those are the menu.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { importListing, productImages, trim, PLAUSIBLE } = require('../utils/ai/importListing');

const AMAZON_THUMB = 'https://m.media-amazon.com/images/I/41k+81er+aL._SS40_.jpg';
const AMAZON_BIG = 'https://m.media-amazon.com/images/I/41k+81er+aL._SL1500_.jpg';
const MEESHO = 'https://images.meesho.com/images/products/386494810/vdoaf_512.webp?width=360';

describe('which pictures come across, and at what size', () => {
  it('asks for the full size, whatever size the page linked', () => {
    expect(productImages([AMAZON_THUMB])).toEqual(['https://m.media-amazon.com/images/I/41k+81er+aL._SL1200_.jpg']);
    expect(productImages([MEESHO])[0]).toMatch(/width=1200$/);
  });

  it('counts one photograph once, however many sizes of it the page carries', () => {
    expect(productImages([AMAZON_THUMB, AMAZON_BIG])).toHaveLength(1);
  });

  it('leaves out what is not a photograph of the product', () => {
    const junk = [
      'https://m.media-amazon.com/images/G/31/gno/sprites/nav-sprite-global._CB5.png',
      'https://fls-eu.amazon.in/1/batch/1/OP/A21TJRUUN4KGV:522',
      'https://www.meesho.com/assets/svgicons/star.svg',
    ];
    expect(productImages(junk)).toEqual([]);
    junk.forEach((u) => expect(PLAUSIBLE(u)).toBe(false));
  });
});

describe('how much of the page the model is asked to read', () => {
  it('starts at the price, not at the top - a marketplace menu is 6,000 characters of nothing', () => {
    const menu = 'Become a Supplier. Top Brands. '.repeat(300); // ~9,000 characters
    const listing = 'Khadi Kurta Set ₹217 M.R.P. ₹551 Fabric: Khadi Cotton';
    const out = trim(menu + listing);
    expect(out).toContain('₹217');
    expect(out).toContain('Khadi Cotton');
  });
});

describe('the import itself', () => {
  const page = {
    ok: true,
    title: 'Rubans Jhumka Earrings',
    // Carries its own ASIN, as a real product page does - that is what proves
    // to the importer that this is the page the seller asked for.
    markdown: 'Rubans Jhumka Earrings Oxidised\n\n₹357.00 with 75 percent savings\n\nM.R.P.: ₹1,400.00\n\nMaterial: Brass. Colour: Green.\n\nASIN B0G57J7ZGK',
    images: [AMAZON_THUMB],
  };
  const facts = {
    ok: true,
    text: JSON.stringify({
      name: 'Rubans Jhumka Earrings Oxidised',
      description: 'Oxidised jhumka earrings with green stones and pearl drops.',
      price: 357,
      mrp: 1400,
      color: 'Green',
      material: 'Brass',
      highlights: ['Oxidised finish', 'Green stones'],
    }),
  };

  it('brings the facts and the photographs across, and saves nothing', async () => {
    const uploaded = [];
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(50_000),
    }));
    const out = await importListing({
      url: 'https://www.amazon.in/x/dp/B0G57J7ZGK',
      userId: 'u1',
      deps: {
        fetchPage: async () => page,
        generate: async (prompt) =>
          /Which of these URLs/.test(prompt)
            ? { ok: true, text: JSON.stringify({ images: ['https://m.media-amazon.com/images/I/41k+81er+aL._SL1200_.jpg'] }) }
            : facts,
        uploadImage: async (data) => {
          uploaded.push(data.slice(0, 22));
          return { url: 'https://res.cloudinary.com/x/imports/1.jpg' };
        },
      },
    });
    expect(out.ok).toBe(true);
    expect(out.draft).toMatchObject({ name: 'Rubans Jhumka Earrings Oxidised', price: 357, mrp: 1400, color: 'Green', material: 'Brass' });
    // Re-hosted on our own Cloudinary, never hot-linked from the other shop.
    expect(out.draft.images).toEqual(['https://res.cloudinary.com/x/imports/1.jpg']);
    expect(uploaded[0]).toMatch(/^data:image\/jpeg;base64/);
    expect(out.draft.source).toContain('amazon.in');
  });

  it('will not fetch a URL the model invented', async () => {
    const asked = [];
    global.fetch = vi.fn(async (u) => {
      asked.push(u);
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(50_000) };
    });
    const out = await importListing({
      url: 'https://www.amazon.in/x/dp/B0G57J7ZGK',
      userId: 'u1',
      deps: {
        fetchPage: async () => ({ ...page, images: [] }),
        generate: async (prompt) =>
          /Which of these URLs/.test(prompt) ? { ok: true, text: JSON.stringify({ images: ['https://evil.example/x.jpg'] }) } : facts,
        uploadImage: async () => ({ url: 'nope' }),
      },
    });
    expect(out.ok).toBe(true);
    expect(out.draft.images).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('will not fetch a photo whose address is not on the public internet', async () => {
    // Caught by the commit's security review: the page URL was guarded and the
    // picture URLs were not, and those come out of somebody else's HTML.
    const dns = require('dns').promises;
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const asked = [];
    global.fetch = vi.fn(async (u) => {
      asked.push(u);
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(50_000) };
    });
    const out = await importListing({
      url: 'https://www.amazon.in/x/dp/B0G57J7ZGK',
      userId: 'u1',
      deps: {
        fetchPage: async () => ({ ...page, images: ['https://cloud-metadata.example/photo.jpg'] }),
        generate: async (prompt) =>
          /Which of these URLs/.test(prompt) ? { ok: true, text: JSON.stringify({ images: ['https://cloud-metadata.example/photo.jpg'] }) } : facts,
        uploadImage: async () => ({ url: 'nope' }),
      },
    });
    expect(out.ok).toBe(true);
    expect(out.draft.images).toEqual([]);
    expect(asked).toEqual([]);
    vi.restoreAllMocks();
  });

  it('does not follow a redirect from a public address to a private one', async () => {
    const dns = require('dns').promises;
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '142.250.183.4', family: 4 }]);
    let uploaded = 0;
    global.fetch = vi.fn(async () => ({ ok: false, status: 302, headers: { get: () => null } }));
    const out = await importListing({
      url: 'https://www.amazon.in/x/dp/B0G57J7ZGK',
      userId: 'u1',
      deps: {
        fetchPage: async () => page,
        generate: async (prompt) =>
          /Which of these URLs/.test(prompt)
            ? { ok: true, text: JSON.stringify({ images: ['https://m.media-amazon.com/images/I/41k+81er+aL._SL1200_.jpg'] }) }
            : facts,
        uploadImage: async () => {
          uploaded += 1;
          return { url: 'nope' };
        },
      },
    });
    expect(out.draft.images).toEqual([]);
    expect(uploaded).toBe(0);
    // `redirect: 'manual'` is what makes the guard's answer final.
    expect(global.fetch.mock.calls[0][1].redirect).toBe('manual');
    vi.restoreAllMocks();
  });

  it('says plainly when the page could not be read', async () => {
    const out = await importListing({
      url: 'https://example.com/x',
      userId: 'u1',
      deps: { fetchPage: async () => ({ ok: false, reason: 'Today’s web-reading allowance is used up. It resets at midnight.' }) },
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/allowance/);
  });
});

describe('the page has to be the page we asked for', () => {
  /*
   * 26 Sep 2026, live: Amazon answered a product URL with its own home page
   * and the import came back as "Trending duck toy". A wrong listing filled
   * into the form silently is worse than an honest failure.
   */
  const frontDoor = {
    ok: true,
    title: 'Online Shopping site in India: Shop Online for Mobiles, Books, Watches, Shoes and More - Amazon.in',
    markdown: 'Fresh - Prime Video - Todays Deals - Trending duck toy ₹199',
    images: [],
  };

  it('refuses the shop front door instead of describing it', async () => {
    let reads = 0;
    const out = await importListing({
      url: 'https://www.amazon.in/Atasi-International/dp/B0CVV1799Z',
      userId: 'u1',
      deps: {
        fetchPage: async () => {
          reads += 1;
          return frontDoor;
        },
        generate: async () => ({ ok: true, text: JSON.stringify({ name: 'Trending duck toy' }) }),
      },
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/home page/i);
    // It tries twice - the second time without the cache - before giving up.
    expect(reads).toBe(2);
  });

  it('accepts a page that carries the id from the address', async () => {
    const out = await importListing({
      url: 'https://www.amazon.in/Atasi-International/dp/B0CVV1799Z',
      userId: 'u1',
      deps: {
        fetchPage: async () => ({ ok: true, title: 'Buy Atasi International…', markdown: 'Atasi International … B0CVV1799Z … ₹299', images: [] }),
        generate: async () => ({ ok: true, text: JSON.stringify({ name: 'Atasi International Necklace Set', price: 299 }) }),
      },
    });
    expect(out.ok).toBe(true);
    expect(out.draft.price).toBe(299);
  });
});

describe('which part of the page the photographs may come from', () => {
  it('takes the gallery beside the price, not the colour strip below it', () => {
    const NL = String.fromCharCode(10);
    const gallery = 'https://m.media-amazon.com/images/I/aaaaaaaaaa._SS40_.jpg';
    const variant = 'https://m.media-amazon.com/images/I/zzzzzzzzzz._SS40_.jpg';
    // price early, gallery beside it, the other colour ten thousand characters later
    const page = `head ![](${gallery}) ₹299 M.R.P. ₹1,999${NL}${'filler '.repeat(2000)}Colour: ![](${variant})`;
    const picked = productImages([gallery, variant], page);
    expect(picked).toHaveLength(1);
    expect(picked[0]).toContain('aaaaaaaaaa');
  });
});
