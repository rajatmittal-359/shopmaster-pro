const { generate } = require('./gemini');
const { checkDescriptionHtml } = require('./safeHtml');
// What each category may and may not claim. The writer reads its rules from
// here rather than assuming the shop sells one kind of thing.
const { templateFor } = require('../config/listingTemplates');

/**
 * Writing a product description that is worth indexing and is not a lie.
 *
 * THE PROBLEM IT EXISTS FOR
 *   Every product in the catalogue carried the same sentence with only the name
 *   swapped - "carefully selected and finished to a high standard, dispatched by
 *   <shop>." Measured on the live feed, 7 September 2026: 17 products,
 *   one description. Google does not index duplicate pages, which is most of why
 *   ninety-three live URLs had produced two indexed ones. It also leaves an AI
 *   assistant nothing to answer with when somebody asks what the difference is
 *   between a kundan choker and a temple necklace.
 *
 * THE TWO THINGS IT MUST NOT DO
 *
 *   1. INVENT FACTS. The model is given only the name, the category and the
 *      price, and told in the prompt that everything else is off limits. A
 *      description that promises matching earrings which are not in the box is
 *      a return, a refund and a bad review, and it is the shop that pays for
 *      all three.
 *
 *   2. CLAIM PRECIOUS METAL. This is imitation jewellery. "Antique Gold Temple
 *      Necklace" is plated brass at RS 6,800; a description that lets a reader
 *      think otherwise is misrepresentation under Merchant Center's policies and
 *      worse than that under consumer law. So the prompt forbids purity claims
 *      and the output is CHECKED for them afterwards - a prompt is a request,
 *      and a request is not a guarantee.
 */

/** Words that would turn imitation jewellery into a claim about real metal. */
const PURITY_CLAIMS =
  /\b(hallmark|hallmarked|916|22\s*(k|ct|carat)|18\s*(k|ct|carat)|14\s*(k|ct|carat)|solid gold|pure gold|real gold|genuine gold|sterling silver|925|pure silver|real silver|solid silver|real diamond|genuine diamond|natural diamond|real emerald|genuine emerald|natural ruby|precious stone)\b/i;

/** Roughly how long a description should be to be worth indexing at all. */
const MIN_WORDS = 45;

/** Any weight at all is wrong: the only one on record is the parcel's. */
const STATES_A_WEIGHT = /\b\d+(\.\d+)?\s*(g|gm|gms|gram|grams|kg|kilogram)s?\b/i;

/** The shop's own name has no business inside its product copy. */
const mentionsBrand = (html, brand) => {
  const name = String(brand || '').trim();
  if (name.length < 3) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(html);
};

const wordCount = (html) =>
  String(html)
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

/**
 * The instructions. Written out here rather than assembled inline because this
 * is the part that decides whether the output is honest, and it should be
 * readable by somebody deciding whether to trust it.
 */
const promptFor = (product) => {
  /*
   * Deliberately only three facts.
   *
   * WEIGHT IS NOT HERE, and was, until a test run put it there. `weight` is the
   * SHIPPING weight - parcel, packaging and all - so the model dutifully
   * announced that a pair of stud earrings weighs 20 grams. True of the box,
   * absurd of the earrings, and a shopper reading it would picture something
   * quite different from what arrives.
   *
   * THE BRAND IS NOT HERE either. Given it, the model opened with "from
   * <shop>" however plainly the rules said not to - and the shop's
   * name is already on the page. Withholding a fact turns out to be a better
   * instruction than forbidding its use.
   *
   * PRICE stays. It is what tells the model whether it is describing an
   * everyday stud or a bridal set, and it never appears in the output.
   */
  /*
   * The category decides the rules, and it is looked up rather than assumed.
   *
   * Until 26 Sep 2026 this prompt opened "You are writing for an Indian online
   * JEWELLERY shop" and rule 3 ordered the model to state that the product is
   * imitation jewellery - for everything. A draft run over the live catalogue
   * produced "this product is imitation jewellery" on a Chikankari kurta and
   * on a brass diya set, and sixteen products were one `--apply` away from
   * carrying it. The model was obeying; the prompt was wrong.
   *
   * `config/listingTemplates.js` already holds what each category may and may
   * not claim, so this reads from there. `mustSay` exists for jewellery alone;
   * `neverClaim` differs per category.
   */
  const categoryName = typeof product.category === 'object' ? product.category?.name : product.category;
  const template = product.template || templateFor(typeof product.category === 'object' ? product.category : { name: categoryName });

  const facts = [
    `Product name: ${product.name}`,
    categoryName ? `Category: ${categoryName}` : null,
    `Price: INR ${product.price}`,
  ]
    .filter(Boolean)
    .join('\n');

  /*
   * The frame never names a category - CLAUDE.md: the site sells anything.
   * Jaipur stays, because the city is the trust story and not a product type.
   */
  return `You are writing the product description for an Indian online
marketplace based in Jaipur, Rajasthan. This particular product is in the
"${template.label}" part of the catalogue.

Here is everything that is actually known about this product. It is a complete
list:

${facts}

Write a description of 90 to 140 words in simple English, as HTML.

RULES, in order of importance:

1. Invent NOTHING. Do not mention measurements, materials, contents, what is
   in the box, compatibility, certification, guarantees, matching pieces or
   anything else that is not in the facts above or plainly implied by the
   product's own name. If you are not sure, leave it out. A promise the parcel
   does not keep becomes a return.

2. Claim NONE of the following about this product, in any wording:
${(template.neverClaim || []).map((c) => `   - ${c}`).join('\n') || '   - anything the facts above do not support'}
${
  template.key === 'jewellery'
    ? `   Words like "gold-toned", "silver-toned", "antique finish", "oxidised
   finish", "stone-studded" are correct and are what you should use.`
    : ''
}
${template.mustSay ? `3. Include ${template.mustSay}.\n` : ''}
${template.mustSay ? '4' : '3'}. Say WHEN and WHY somebody would use it - the occasion or the everyday
   moment, and what it goes with. Write for an Indian reader, and choose
   language that genuinely fits THIS product: an outfit belongs at a wedding
   or a festival, a kitchen or decor piece belongs in a home and at Diwali, a
   cable or a gadget belongs in a bag, a car or a desk. Do not force an
   occasion onto something that has none. This is the part people search for.

${template.mustSay ? '5' : '4'}. End with one line of practical care or use advice, but only if it is
   genuinely useful for this kind of product. Do not invent a care ritual for
   something that needs none.

${template.mustSay ? '6' : '5'}. Do not mention the price, any discount, delivery, the shop's name, or how
   much the item weighs.

FORMAT: two or three <p> paragraphs. You may use <strong> for emphasis. No
other HTML tags, no attributes on any tag, no markdown, no headings, no
preamble. Return only the HTML.`;
};

/**
 * Draft one description.
 *
 * @param {{name: string, category?: string, price: number, weight?: number, brand?: string}} product
 * @returns {Promise<{ok: true, html: string}|{ok: false, reason: string}>}
 */
const draftDescription = async (product) => {
  if (!product?.name) {
    return { ok: false, reason: 'A product needs a name before it can be described' };
  }

  const result = await generate(promptFor(product), { temperature: 0.8 });
  if (!result.ok) return result;

  // Models like to wrap HTML in a code fence however firmly you ask them not to.
  const html = result.text
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  /*
   * The prompt asked for all of this. These check it, because between asking
   * and getting there is a model, and the cost of a bad description reaching
   * the shop is a customer told something untrue about what they are buying.
   */
  if (PURITY_CLAIMS.test(html)) {
    return {
      ok: false,
      reason: `Rejected - it claims real precious metal or stones: "${html.match(PURITY_CLAIMS)[0]}"`,
    };
  }
  /*
   * The same check the Product model applies on save - deliberately the same
   * function and not a second opinion, because a drafter that permits what the
   * model refuses produces copy that cannot be stored, and one that permits
   * MORE is a hole with extra steps.
   */
  const safe = checkDescriptionHtml(html);
  if (!safe.ok) {
    return { ok: false, reason: `Rejected - unsafe HTML: ${safe.reason}` };
  }
  if (wordCount(html) < MIN_WORDS) {
    return { ok: false, reason: `Rejected - only ${wordCount(html)} words, too thin to index` };
  }

  /*
   * Both of these exist because a real run broke them. The prompt asked for
   * neither and the model produced both - which is the whole argument for
   * checking output rather than trusting instructions.
   */
  if (mentionsBrand(html, product.brand)) {
    return { ok: false, reason: 'Rejected - it advertised the shop inside the description' };
  }
  if (STATES_A_WEIGHT.test(html)) {
    // The only weight on record is the parcel's, so any weight here is wrong.
    return { ok: false, reason: 'Rejected - it stated a weight, which we do not actually know' };
  }

  return { ok: true, html };
};

module.exports = {
  draftDescription,
  promptFor,
  PURITY_CLAIMS,
  STATES_A_WEIGHT,
  mentionsBrand,
  wordCount,
  MIN_WORDS,
};
