const { generate } = require('./gemini');

/**
 * Writing a product description that is worth indexing and is not a lie.
 *
 * THE PROBLEM IT EXISTS FOR
 *   Every product in the catalogue carried the same sentence with only the name
 *   swapped - "carefully selected and finished to a high standard, dispatched by
 *   Charming Jewels." Measured on the live feed, 7 September 2026: 17 products,
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

/**
 * Tags a description may contain.
 *
 * The product page renders this field with dangerouslySetInnerHTML and does not
 * sanitise it, so anything that reaches the field runs in the customer's
 * browser. That is a pre-existing hole and a separate fix; this function simply
 * refuses to be the thing that walks through it.
 */
const ALLOWED_TAGS = /^(p|br|ul|ol|li|strong|em)$/i;

const hasOnlySafeTags = (html) => {
  const tags = [...String(html).matchAll(/<\s*\/?\s*([a-zA-Z0-9-]+)[^>]*>/g)].map((m) => m[1]);
  return tags.every((t) => ALLOWED_TAGS.test(t));
};

const hasAttributes = (html) => /<\s*[a-zA-Z0-9-]+\s+[^>]*>/.test(html);

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
   * Charming Jewels" however plainly the rules said not to - and the shop's
   * name is already on the page. Withholding a fact turns out to be a better
   * instruction than forbidding its use.
   *
   * PRICE stays. It is what tells the model whether it is describing an
   * everyday stud or a bridal set, and it never appears in the output.
   */
  const facts = [
    `Product name: ${product.name}`,
    product.category ? `Category: ${product.category}` : null,
    `Price: INR ${product.price}`,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are writing the product description for an Indian online jewellery
shop. The shop is in Jaipur, Rajasthan and sells IMITATION jewellery - fashion
jewellery, artificial jewellery - not precious metal.

Here is everything that is actually known about this product. It is a complete
list:

${facts}

Write a description of 90 to 140 words in simple English, as HTML.

RULES, in order of importance:

1. Invent NOTHING. Do not mention matching pieces, closures, stone counts,
   chain lengths, adjustability, packaging, guarantees or anything else that
   is not in the facts above or plainly implied by the product's own name. If
   you are not sure, leave it out. A promise the parcel does not keep becomes a
   return.

2. Never suggest the metal or stones are real. No carat or purity claims, no
   "hallmarked", no "sterling silver", no "genuine" or "natural" stones. Words
   like "gold-toned", "silver-toned", "antique finish", "oxidised finish",
   "stone-studded" are correct and are what you should use.

3. Include one short sentence stating plainly that this is imitation jewellery.

4. Say WHEN somebody would wear it - the occasion, and what it goes with.
   Indian context: saree, lehenga, kurta, salwar suit, sangeet, mehendi,
   wedding, festival, office, daily wear. Choose what genuinely suits this
   piece and this price. This is the part people search for.

5. End with one line of care advice appropriate to imitation jewellery -
   keeping it away from perfume and water, wiping it dry, storing it in a
   pouch.

6. Do not mention the price, any discount, delivery, the shop's name, or how
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
  if (!hasOnlySafeTags(html)) {
    return { ok: false, reason: 'Rejected - it used HTML tags that are not allowed' };
  }
  if (hasAttributes(html)) {
    return { ok: false, reason: 'Rejected - it put attributes on a tag' };
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
  hasOnlySafeTags,
  hasAttributes,
  wordCount,
  MIN_WORDS,
};
