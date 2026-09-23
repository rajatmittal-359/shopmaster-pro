const { fetchPage } = require('../research');
const { generate } = require('../gemini');
const { uploadImage } = require('../cloudinary');
const { templateFor } = require('../../config/listingTemplates');

/**
 * "Paste the link, get the listing" (24 Sep 2026).
 *
 * WHY THIS IS THE ONE FEATURE FIRECRAWL IS HERE FOR
 *   A shop joining us already sells somewhere - Meesho, Amazon, an Instagram
 *   post. Retyping thirty listings is the reason a shop signs up and never
 *   lists. Meesho and Glowroad both recruit with an import button; Amazon's
 *   own "add from another marketplace" is the same idea.
 *
 *   Nothing else in this project can do it: Gemini reads a Meesho page for
 *   free but returns no image URLs, and amazon.in does not let its fetcher in
 *   at all (both measured, 24 Sep). The photographs are the point - a listing
 *   without them is a form the seller still has to fill.
 *
 * WHOSE PHOTOS
 *   The seller's own. The panel says so before the field, and the import is
 *   one link at a time, by hand, by a signed-in approved seller - it is a
 *   shop moving its own catalogue, not a machine copying somebody else's. The
 *   pictures are re-hosted on our Cloudinary rather than hot-linked, so the
 *   page does not lean on another shop's CDN.
 *
 * NOTHING IS SAVED
 *   The answer fills the form. The seller reads it, fixes the price, writes
 *   their own description if they want, and presses Save - the same gates as
 *   any other listing (honest price, required facts, photo rules).
 */

/** Tracking pixels, sprites and icons, out. Product photographs, in. */
const PLAUSIBLE = (u) =>
  /^https:\/\//i.test(u) &&
  !/\/(batch|events?|pixel|beacon|track)\//i.test(u) &&
  !/\.(svg|gif)(\?|$)/i.test(u) &&
  !/(sprite|logo|icon|badge|star|rating|flag|avatar|nav-)/i.test(u) &&
  !/media-amazon\.com\/images\/G\//i.test(u);

/**
 * The same photograph, big (24 Sep 2026).
 *
 * A marketplace page carries its pictures as thumbnails - Amazon's markdown
 * gives `._SS40_.jpg`, forty pixels across, and Meesho asks for `?width=360`.
 * Importing those would put postage stamps on the listing. Both sites serve
 * the full size from the same URL with the size token changed, and the id in
 * the middle is what says "this is the same photograph", so it is also how
 * five sizes of one picture are collapsed into one candidate.
 */
const bigVersion = (u) =>
  u
    .replace(/\._[A-Z0-9,_]+_\.(jpg|jpeg|png|webp)/i, '._SL1200_.$1')
    .replace(/([?&])width=\d+/i, '$1width=1200');

const identity = (u) => {
  const amazon = /media-amazon\.com\/images\/I\/([^.]+)\./i.exec(u);
  if (amazon) return `amazon:${amazon[1]}`;
  return u.replace(/([?&])width=\d+/i, '').replace(/\._[A-Z0-9,_]+_\./i, '.');
};

/** Plausible, full-size, one entry per photograph, best first. */
const productImages = (images = []) => {
  const seen = new Map();
  for (const raw of images) {
    if (!PLAUSIBLE(raw)) continue;
    const id = identity(raw);
    if (!seen.has(id)) seen.set(id, bigVersion(raw));
  }
  return [...seen.values()].slice(0, 12);
};

/**
 * The part of the page that is the listing.
 *
 * Amazon's page is 85,000 characters and Meesho's 62,000, most of it
 * navigation, "customers also bought" and footer. Handing all of that to a
 * small model buries the listing: the first run came back with a title and
 * nothing else.
 *
 * THE PRICE IS THE ANCHOR, not the top of the file. Taking the first 6,000
 * characters worked on Amazon (its price sits at 2,790) and failed on Meesho,
 * whose first 6,000 characters are the menu - so the model saw "Become a
 * Supplier" and no product. The first rupee sign on a product page is the
 * product's own price, and the title and the buy box are around it. Named
 * sections ("About this item", "Product details") are kept on top of that.
 */
const SECTIONS = /(about this item|product details|technical details|specifications?|product information|highlights|material|description)/i;
const trim = (markdown) => {
  const NL = String.fromCharCode(10);
  const priceAt = markdown.indexOf('₹');
  const from = priceAt > 0 ? Math.max(0, priceAt - 2500) : 0;
  const head = markdown.slice(from, from + 9000);
  // Line by line rather than one clever regex: keep a named section and the
  // twenty lines under it, skip everything else.
  const lines = markdown.slice(from + 9000).split(NL);
  const kept = [];
  let left = 0;
  for (const line of lines) {
    if (SECTIONS.test(line) && line.length < 120) left = 20;
    if (left > 0) {
      kept.push(line);
      left -= 1;
    }
    if (kept.length > 300) break;
  }
  return head + NL + NL + kept.join(NL).slice(0, 6000);
};

/*
 * TWO SMALL QUESTIONS, NOT ONE BIG ONE (24 Sep 2026).
 *
 * The first version asked for everything at once - the facts, the attribute
 * enums for the whole category template, and a choice of five URLs out of
 * forty - on top of twelve thousand characters of page. The free model that
 * answers most of the day is the lite one, and it simply stopped: a title came
 * back and every other field was empty. Split in two, each question fits, and
 * each is cheap enough to retry.
 */
const FACTS_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    price: { type: 'number' },
    mrp: { type: 'number' },
    color: { type: 'string' },
    size: { type: 'string' },
    material: { type: 'string' },
    productType: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
  },
  required: ['name'],
};

const IMAGES_SCHEMA = {
  type: 'object',
  properties: { images: { type: 'array', items: { type: 'string' } } },
  required: ['images'],
};

const factsPrompt = (page, template) => `One product's page from an Indian marketplace, as text. Pull the listing out of it. Reply with JSON only.

- Use only what the page says. Never invent a price, a material or a measurement.
- "price" is what a buyer pays today, in rupees, as a number; "mrp" the struck-through price, or leave it out.
- "description": your own plain words, 40-80 words, no shouting, no claim the page does not make.
- "highlights": up to 5 short factual lines.
${template.productTypes?.length ? `- "productType": one of ${template.productTypes.slice(0, 24).join(', ')}` : ''}

THE PAGE
${page}`;

const imagesPrompt = (name, candidates) => `Which of these URLs are photographs of "${name}"? Reply with JSON only: {"images": [up to 5 urls, main photo first]}.

Leave out logos, icons, banners, payment badges and other products. Copy the URLs exactly as written.

${candidates.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;

/**
 * @param {object} args
 * @param {string} args.url        the seller's own listing, somewhere else
 * @param {string} args.userId
 * @param {object} [args.category] the category document, when one is chosen already
 * @returns {Promise<{ok: boolean, draft?: object, via?: string, reason?: string}>}
 */
const importListing = async ({ url, userId, category = null, deps = {} }) => {
  const read = deps.fetchPage || fetchPage;
  const write = deps.generate || generate;
  const upload = deps.uploadImage || uploadImage;

  const page = await read(url, { userId });
  if (!page.ok) return { ok: false, reason: page.reason };

  const template = templateFor(category);
  const candidates = productImages(page.images);

  /** `generate` hands back text; with a schema that text is the JSON. */
  const asJson = (answer) => {
    if (answer.json) return answer.json;
    const raw = String(answer.text || '').replace(/^```(?:json)?|```$/gm, '').trim();
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const factsAnswer = await write(factsPrompt(trim(page.markdown || ''), template), {
    responseSchema: FACTS_SCHEMA,
    temperature: 0.3,
  });
  const j = asJson(factsAnswer);
  if (!factsAnswer.ok || !j?.name) {
    return { ok: false, reason: factsAnswer.reason || 'That page did not read like a product listing.' };
  }

  /*
   * Re-hosted, not hot-linked, and only the ones the model picked FROM our
   * candidate list - a model that invents a URL must not make the server go
   * and fetch it.
   */
  let chosen = [];
  if (candidates.length) {
    const pick = await write(imagesPrompt(j.name, candidates), { responseSchema: IMAGES_SCHEMA, temperature: 0 });
    chosen = asJson(pick)?.images || [];
    // A model that will not choose is no reason to import a listing with no
    // pictures: the candidates are already filtered to product photographs.
    if (!chosen.length) chosen = candidates.slice(0, 5);
  }
  const picked = chosen.filter((u) => candidates.includes(u)).slice(0, 5);
  const images = [];
  for (const src of picked) {
    try {
      const res = await fetch(src, { headers: { accept: 'image/*' } });
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') || '').split(';')[0];
      if (!/^image\//.test(type)) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024 || bytes.length < 4 * 1024) continue; // 4KB is an icon, 5MB is our limit
      const saved = await upload(`data:${type};base64,${bytes.toString('base64')}`, 'shopmaster/imports');
      images.push(saved.url);
    } catch {
      // One photo that will not come is not a failed import.
    }
  }

  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : undefined);
  return {
    ok: true,
    via: page.cached ? 'cache' : 'firecrawl',
    draft: {
      name: String(j.name).trim().slice(0, 150),
      description: String(j.description || '').trim().slice(0, 4000),
      price: num(j.price),
      mrp: num(j.mrp),
      color: String(j.color || '').trim().slice(0, 60) || undefined,
      size: String(j.size || '').trim().slice(0, 40) || undefined,
      material: String(j.material || '').trim().slice(0, 80) || undefined,
      productType: template.productTypes?.includes(j.productType) ? j.productType : undefined,
      highlights: (Array.isArray(j.highlights) ? j.highlights : []).map((h) => String(h).trim().slice(0, 140)).filter(Boolean).slice(0, 5),
      images,
      source: url,
    },
  };
};

module.exports = { importListing, PLAUSIBLE, FACTS_SCHEMA, productImages, trim };
