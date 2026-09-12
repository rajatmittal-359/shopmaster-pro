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

const JEWELLERY_WORDS =
  /\b(jewell?ery|earring|necklace|ring|bangle|bracelet|anklet|pendant|chain|jhumka|maang ?tikka|mangalsutra|nath|nose ?pin|choker|kada|haar|tikka)\b/i;

const looksLikeJewellery = (...texts) => texts.some((t) => JEWELLERY_WORDS.test(String(t || '')));

const promptFor = ({ name, keywords, price, categoryName, categoryOptions = [], hasImage }) => {
  const facts = [
    name ? `Seller's product name: ${name}` : null,
    keywords ? `Seller's keywords: ${keywords}` : null,
    categoryName ? `Seller's chosen category: ${categoryName}` : null,
    price ? `Price: INR ${price}` : null,
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

4. Write in simple English an Indian shopper would search for. Say WHEN and with what it would be used
   or worn - occasion, pairing, season. This is the part people search for.

5. "color" is ONE primary colour in plain English. "gender" is who it is for; use "unisex" when it
   genuinely is. "size" only if a labelled size is visible or stated.

6. The description is HTML using only <p>, <ul>, <li>, <strong>, <em>. No headings, no links, no styles.`;
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
  if (!input.name && !input.imageUrl && !input.imageDataUrl) {
    return { ok: false, reason: 'Give a product name or a photo to start from.' };
  }

  const hasImage = Boolean(input.imageUrl || input.imageDataUrl);
  const answer = await deps.generate(promptFor({ ...input, hasImage }), {
    imageUrl: input.imageUrl,
    imageDataUrl: input.imageDataUrl,
    responseSchema: RESPONSE_SCHEMA,
    temperature: 0.6,
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

  const jewellery = draft.isJewellery || looksLikeJewellery(input.name, input.keywords, input.categoryName, draft.name);

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

module.exports = { draftListing, promptFor, RESPONSE_SCHEMA, looksLikeJewellery };
