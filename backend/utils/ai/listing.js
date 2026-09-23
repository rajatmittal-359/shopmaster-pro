/**
 * Filling in a product listing from a photo and a few words.
 *
 * WHAT IT IS FOR
 *   A seller has a phone photo of a kurti, a bedsheet, a pair of earrings.
 *   They know what it is; they do not want to write 120 words about it, pick
 *   a colour word Google's feed accepts, guess a category, or think up tags.
 *   Amazon's "generate listing content" and Shopify Magic exist because that
 *   form is where sellers give up. This does the same job, from the picture.
 *
 * WHY IT IS NOT productCopy.js
 *   That file writes for "an Indian online jewellery shop" - correct when the
 *   catalogue was one shop, and exactly the assumption this platform no longer
 *   makes. This one is category-neutral and applies the jewellery honesty
 *   rules ONLY when the product is jewellery. It also returns structured
 *   fields, not a paragraph: the form has a colour box and a gender box, and
 *   a paragraph does not fill those.
 *
 * WHAT IT MUST NOT DO
 *   1. Invent. The model sees the photo and whatever the seller typed, and is
 *      told that is the complete list of facts. Nothing about closures,
 *      counts, packaging, sizes it cannot see.
 *   2. Claim precious metal on jewellery. Prompted against, and CHECKED after -
 *      a prompt is a request, and a request is not a guarantee.
 *   3. Name the shop, or state a weight. The shop is already on the page and
 *      the only weight on record is the parcel's.
 *   4. Decide anything. Every field comes back as a SUGGESTION the seller
 *      edits before saving. The form is the human in the loop.
 */
const { generate } = require('../gemini');
const { PURITY_CLAIMS, STATES_A_WEIGHT, mentionsBrand } = require('../productCopy');
const { checkDescriptionHtml } = require('../safeHtml');

const GENDERS = ['male', 'female', 'unisex'];
const AGE_GROUPS = ['newborn', 'infant', 'toddler', 'kids', 'adult'];

/** The exact shape asked of the model. Gemini enforces it on its side too. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Product title, 40-90 characters, no brand name, no price' },
    description: {
      type: 'string',
      description:
        'HTML using only <p>, <ul>, <li>, <strong>, <em>. 90-160 words. Two or three short paragraphs, optionally one bullet list.',
    },
    bullets: { type: 'array', items: { type: 'string' }, description: '3 to 5 short highlight phrases' },
    tags: { type: 'array', items: { type: 'string' }, description: '5 to 10 lowercase search words or short phrases' },
    color: { type: 'string', description: 'Primary colour in plain English, e.g. "Emerald Green", "Rose Gold"' },
    material: { type: 'string', description: 'What it is visibly made of, in honest plain words, or empty' },
    gender: { type: 'string', enum: GENDERS },
    ageGroup: { type: 'string', enum: AGE_GROUPS },
    size: { type: 'string', description: 'Labelled size ONLY if visible or stated ("M", "Free Size"), else empty' },
    categoryName: { type: 'string', description: 'The best match from the category list given, verbatim, or empty' },
    isJewellery: { type: 'boolean' },
    photoIssues: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Problems with the photo that would hurt sales or fail a marketplace image check: blurry, too dark, cluttered background, product cut off, watermark or text on the image, product too small in frame. Empty if none. Short phrases.',
    },
  },
  required: ['name', 'description', 'bullets', 'tags', 'color', 'gender', 'ageGroup', 'categoryName', 'isJewellery'],
};

/**
 * The schema for ONE category (21 Sep 2026): the base fields plus the
 * template's attributes as enums (a select can only be one of Flipkart's
 * options) or strings, and the product type from the template's list. Gemini
 * enforces the enums on its side, so the model cannot invent "Gold Toned
 * Plating" - it picks "Gold Plated" or leaves it empty.
 */
const schemaFor = (template) => {
  if (!template) return RESPONSE_SCHEMA;
  const attributes = {};
  for (const a of template.attributes) {
    // Gemini refuses an empty string inside an enum; "unknown" is the omit-me value and is dropped by cleanAttributes.
    if (a.type === 'select') attributes[a.key] = { type: 'string', enum: [...a.options, 'unknown'], description: `${a.label}; "unknown" when not visible or stated` };
    else if (a.type === 'multi') attributes[a.key] = { type: 'array', items: { type: 'string', enum: a.options }, maxItems: a.max || 3, description: `${a.label} - every value that is TRUE of this piece, at most ${a.max || 3}; an empty list when none is visible` };
    else attributes[a.key] = { type: 'string', description: `${a.label}${a.hint ? ` - e.g. ${a.hint}` : ''}; empty when unknown` };
  }
  return {
    ...RESPONSE_SCHEMA,
    properties: {
      ...RESPONSE_SCHEMA.properties,
      productType: template.productTypes.length
        ? { type: 'string', enum: [...template.productTypes, 'other'], description: 'What the item IS, in the words the category uses; "other" if none fits' }
        : { type: 'string', description: 'What the item is, in two or three plain words ("Brass Diya", "Wooden Tray")' },
      attributes: { type: 'object', properties: attributes, description: 'The facts a shopper filters on. Fill only what is visible or stated.' },
    },
    required: [...RESPONSE_SCHEMA.required, 'productType', 'attributes'],
  };
};

const JEWELLERY_WORDS =
  /\b(jewell?ery|earring|necklace|ring|bangle|bracelet|anklet|pendant|chain|jhumka|maang ?tikka|mangalsutra|nath|nose ?pin|choker|kada|haar|tikka)\b/i;

const looksLikeJewellery = (...texts) => texts.some((t) => JEWELLERY_WORDS.test(String(t || '')));

const promptFor = ({ name, keywords, price, stock, categoryName, categoryOptions = [], hasImage, template = null, marketWords = [] }) => {
  const facts = [
    name ? `Seller's product name: ${name}` : null,
    keywords ? `Seller's keywords: ${keywords}` : null,
    categoryName ? `Seller's chosen category: ${categoryName}` : null,
    price ? `Price: INR ${price}` : null,
    stock ? `Quantity the seller has in stock: ${stock} (an inventory count - NOT a set, pack or pair; never mention it in the listing)` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are helping a small Indian seller list a product on an online marketplace based in Jaipur.
${hasImage ? 'Look carefully at the photograph provided.' : 'There is no photograph; work from the words only.'}

Everything actually known about this product - this is the COMPLETE list:
${facts || '(nothing beyond the photograph)'}

Available categories on this marketplace (choose the single best match, copied exactly, or leave empty):
${categoryOptions.length ? categoryOptions.map((c) => `- ${c}`).join('\n') : '(none provided)'}

Fill in the listing. RULES, in order of importance:

1. Invent NOTHING you cannot see in the photo or read in the facts. No counts, closures, chain lengths,
   fabric composition, packaging, guarantees, or matching pieces unless visible or stated. When unsure,
   leave it out or leave the field empty. A promise the parcel does not keep becomes a return.

2. If this is jewellery, it is IMITATION / fashion jewellery unless the facts say otherwise. Never use
   carat or purity claims, "hallmarked", "sterling silver", "genuine" or "natural" stones. Use
   "gold-toned", "silver-toned", "antique finish", "oxidised finish", "stone-studded". Include one plain
   sentence saying it is imitation jewellery.

3. Do not mention any shop name, brand name, price, delivery, or weight in the description.

4. The seller's words may be in English, Hindi, Hinglish or any language - read them as facts. Write the
   listing in simple English an Indian shopper would search for. Say WHEN and with what it would be used
   or worn - occasion, pairing, season. This is the part people search for.

5. "color" is ONE primary colour in plain English. "gender" is who it is for; use "unisex" when it
   genuinely is. "size" only if a labelled size is visible or stated.

6. The description is HTML using only <p>, <ul>, <li>, <strong>, <em>. No headings, no links, no styles.${template ? templateRules(template, marketWords) : ''}`;
};

/**
 * The category's own rules, appended to the prompt (config/listingTemplates):
 * which facts to read off the photo, the bullet recipe, what must never be
 * said, and the words buyers actually type (template seeds + this week's
 * market brief) so the tags are search words, not synonyms of the title.
 */
const templateRules = (template, marketWords = []) => {
  const facts = template.attributes.map((a) => `${a.label}${a.type !== 'text' ? ` (one of: ${a.options.join(' / ')})` : a.hint ? ` (e.g. ${a.hint})` : ''}`).join('; ');
  const words = [...new Set([...(template.seoSeeds || []), ...marketWords])].slice(0, 20);
  return `

CATEGORY RULES - ${template.label}:
7. "attributes" are the facts a shopper filters on. Read them off the photo and the facts: ${facts}. Leave an attribute EMPTY when it is not visible or stated - never guess.
8. "productType" is what the item IS in the category's own words${template.productTypes.length ? ` (one of: ${template.productTypes.join(' / ')})` : ''}.
9. TITLE FORMULA (Flipkart/Amazon style): facts left to right, most-searched first, 6-12 words, no adjectives like "beautiful", no price, no shop name, no word more than twice. Keep the product noun and the colour. Examples of the shape: "Women Pure Cotton Printed Kurta Palazzo Dupatta Set", "Men Grey Cotton Blend Cargo Jogger Trousers", "Cotton Double Flat 144 TC Jaipuri Print Bedsheet with 2 Pillow Covers", "Brass Gold-plated Kundan Maroon Necklace Set", "20000 mAh 35W USB-C Fast Charging Power Bank".
10. Bullets follow this order: ${template.bullets.map((b, i) => `${i + 1}) ${b}`).join(' ')}.
${template.neverClaim.length ? `11. NEVER say: ${template.neverClaim.join(', ')}.` : ''}${template.mustSay ? ` ALWAYS include ${template.mustSay}.` : ''}
12. "tags" are search words as Indian shoppers type them (Hinglish welcome: "kurti", "jhumka", "bedsheet double bed"). Prefer these, in this order of importance, plus 3-5 specific to this item: ${words.join(', ') || '(none given)'}.`;
};

/**
 * @param {object} input
 * @param {string} [input.name]
 * @param {string} [input.keywords]
 * @param {number} [input.price]
 * @param {string} [input.categoryName]
 * @param {string[]} [input.categoryOptions]
 * @param {string} [input.imageUrl]      a photo already on Cloudinary
 * @param {string} [input.imageDataUrl]  a photo still in the browser, base64
 * @param {string} [input.brand]         the seller's shop name, to check it stayed out
 * @param {object} [deps]                `generate` is replaceable in tests
 * @returns {Promise<{ok: true, draft: object, warnings: string[]}|{ok: false, reason: string}>}
 */
const draftListing = async (input, deps = { generate }) => {
  if (!input.name && !input.keywords && !input.imageUrl && !input.imageDataUrl) {
    return { ok: false, reason: 'Give a photo, a name, or a few words about the product - in any language.' };
  }

  const hasImage = Boolean(input.imageUrl || input.imageDataUrl);
  const template = input.template || null;
  const answer = await deps.generate(promptFor({ ...input, hasImage }), {
    imageUrl: input.imageUrl,
    imageDataUrl: input.imageDataUrl,
    responseSchema: schemaFor(template),
    temperature: 0.6,
    // Which road: Gemini first with nano behind it, or one of them by name.
    textModel: input.textModel || 'auto',
  });
  if (!answer.ok) return answer;

  let draft;
  try {
    draft = JSON.parse(answer.text);
  } catch {
    return { ok: false, reason: 'The model did not return a usable listing. Try again.' };
  }

  /*
   * Normalise and CHECK. The schema constrains the shape; these are the
   * promises the shape cannot express.
   */
  const warnings = [];
  const clean = (s) => String(s ?? '').trim();

  draft.name = clean(draft.name).slice(0, 120);
  draft.description = clean(draft.description);
  draft.bullets = (Array.isArray(draft.bullets) ? draft.bullets : []).map(clean).filter(Boolean).slice(0, 5);
  draft.tags = (Array.isArray(draft.tags) ? draft.tags : [])
    .map((t) => clean(t).toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
  draft.color = clean(draft.color).slice(0, 100);
  draft.material = clean(draft.material).slice(0, 100);
  draft.size = clean(draft.size).slice(0, 30);
  draft.gender = GENDERS.includes(draft.gender) ? draft.gender : 'unisex';
  draft.ageGroup = AGE_GROUPS.includes(draft.ageGroup) ? draft.ageGroup : 'adult';
  draft.categoryName = (input.categoryOptions || []).includes(draft.categoryName) ? draft.categoryName : '';

  // The category template (config/listingTemplates): attributes snapped to
  // the option lists, the product type from the list, the TITLE built from
  // the formula - the model's own title stays only when the formula has
  // nothing to say (no attributes came back).
  if (template) {
    const T = require('../../config/listingTemplates');
    draft.attributes = T.cleanAttributes(template, draft.attributes);
    const pt = clean(draft.productType);
    draft.productType = template.productTypes.length ? (template.productTypes.find((x) => x.toLowerCase() === pt.toLowerCase()) || '') : pt.slice(0, 60);
    // The TITLE (22 Sep, after the first rewrite run): the model's own title,
    // written to the formula in the prompt, wins - it keeps the product noun
    // and the colour ("Grey Cargo Jogger Trousers"). The formula-built title
    // replaces it only when the model's is unusable (too short, or a word
    // said three times, or a banned claim). The first run did the reverse and
    // turned "Men's Grey Cargo Jogger Trousers" into "Men Solid Trousers".
    const built = T.titleFrom(template, draft.attributes, { color: draft.color, productType: draft.productType, brand: input.brandForTitle || '', idealFor: draft.attributes.idealFor, netQuantity: input.netQuantity || '' });
    const words = draft.name.toLowerCase().match(/[a-z0-9]+/g) || [];
    const repeated = [...new Set(words)].some((w) => w.length > 2 && words.filter((x) => x === w).length > 2);
    const usable = words.length >= 4 && draft.name.length <= 150 && !repeated;
    if (!usable && built.split(' ').length >= 4) draft.name = built;
    draft.name = draft.name.replace(/\s*\((AD|CZ)\)/g, '').replace(/\s+/g, ' ').trim();
    // Tags: the model's own first, then only those template / market seeds
    // that share a real word with THIS item (a jhumka must not carry "ad
    // necklace set"), plus the category-wide generic ones (first two seeds).
    const about = `${draft.name} ${draft.productType} ${input.categoryName || ''} ${draft.description}`.toLowerCase();
    const tokens = new Set(about.match(/[a-z]{4,}/g) || []);
    const seeds = [...(template.seoSeeds || []), ...(input.marketWords || [])].map((t) => t.toLowerCase());
    // No "always" seeds: a shirt must not carry "kurti for women" because it
    // is the category's first seed. Only a seed that names this item joins.
    const relevant = seeds.filter((t) => t.split(/\s+/).some((w) => w.length >= 4 && tokens.has(w) && !['women', 'girls', 'mens', 'set', 'with', 'wear'].includes(w)));
    draft.tags = [...new Set([...draft.tags, ...relevant])].slice(0, 15);
  } else {
    delete draft.attributes;
    delete draft.productType;
  }

  const jewellery = draft.isJewellery || looksLikeJewellery(input.name, input.keywords, input.categoryName, draft.name);

  // Relevance (15 Sep 2026): a weaker model, handed a photo and a word, has
  // written about a different thing altogether. The draft must share a real
  // word with what the seller typed - when the seller typed anything.
  const { expandQuery } = require('../searchSynonyms');
  const said = expandQuery(`${input.name || ''} ${input.keywords || ''}`).toLowerCase().match(/[\p{L}]{4,}/gu) || [];
  if (said.length) {
    const wrote = `${draft.name} ${draft.description} ${draft.tags.join(' ')}`.toLowerCase();
    if (!said.some((w) => wrote.includes(w))) {
      return { ok: false, reason: `The draft was not about "${input.name || input.keywords}" - the model wandered. Try again, or add a word or two.` };
    }
  }

  const html = checkDescriptionHtml(draft.description);
  if (!html.ok) {
    // Strip to text rather than fail: the seller can still edit a paragraph.
    draft.description = `<p>${draft.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</p>`;
    warnings.push('The description was simplified to plain paragraphs.');
  }

  if (jewellery && PURITY_CLAIMS.test(`${draft.name} ${draft.description} ${draft.bullets.join(' ')}`)) {
    return {
      ok: false,
      reason: 'The draft claimed real gold, silver or stones, which we never do for imitation jewellery. Try again.',
    };
  }
  if (STATES_A_WEIGHT.test(draft.description)) {
    warnings.push('The description mentioned a weight - check it, the only weight we know is the parcel’s.');
  }
  if (input.brand && mentionsBrand(draft.description, input.brand)) {
    warnings.push('The description named your shop; the shop is already shown on the page.');
  }

  // The photo, judged by the same eyes that wrote the copy. Amazon rejects a
  // blurry or cluttered main image outright; we tell the seller before Google
  // or a shopper does. Advice, not a block - the seller decides.
  const photoIssues = (Array.isArray(draft.photoIssues) ? draft.photoIssues : []).map(clean).filter(Boolean).slice(0, 4);
  if (hasImage && photoIssues.length) {
    warnings.push(`About the photo: ${photoIssues.join('; ')}. A clean, bright, close photo sells better - the photo tools can help.`);
  }
  delete draft.photoIssues;

  return { ok: true, draft, warnings, provider: answer.provider || 'gemini', model: answer.model || undefined };
};

module.exports = { draftListing, promptFor, schemaFor, RESPONSE_SCHEMA, looksLikeJewellery };
