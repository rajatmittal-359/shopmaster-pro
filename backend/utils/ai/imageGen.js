/**
 * Making and fixing product pictures, with the free providers stacked.
 *
 * THE TIERS, AND WHY THERE ARE TIERS AT ALL
 *   Rajat's rule, and the leaderboard agrees with it: give the best model
 *   first, and when somebody is generating a lot, move them to the one that
 *   does not run out.
 *
 *     premium   gpt-image-2 (#3 in the world, ~7 a day free on Pollen), then
 *               FLUX.2 klein 9B (excellent, ~7 a day on Cloudflare's neurons)
 *     standard  FLUX.2 klein 4B on Cloudflare (~80 a day free)
 *     fast      FLUX.1 schnell (cheap, unlimited on Pollinations; text only)
 *
 *   The Cloudflare numbers come from its published per-tile pricing, not from
 *   the "230 images a day" that every blog repeats - that figure is schnell's,
 *   and the first afternoon of testing found out the hard way that FLUX.2 dev
 *   is roughly sixty times dearer.
 *
 *   Each tier is an ORDERED LIST of (provider, model). A quota or upstream
 *   failure moves to the next entry; an input failure stops, because the same
 *   bad request will be bad everywhere. The caller only ever names a tier.
 *
 * THE MODES ARE WHAT A SELLER ACTUALLY ASKS FOR
 *   Not "generate an image" - nobody on a marketplace wants that. They have a
 *   phone photo of a real product and they want it to look like a listing:
 *
 *     clean      same product, pure white studio background
 *     lifestyle  same product, shown in use
 *     custom     same product, in whatever scene the seller describes -
 *                "a model wearing these jhumkas, side profile, soft light".
 *                Their words go AFTER the keep-the-product rule, never
 *                instead of it
 *     generate   from words alone - for banners and category art, not
 *                for products, because a product picture must be of the
 *                product that ships
 *
 *   The first three are EDITS: the seller's photo goes in as a reference and
 *   the prompt says, in every mode, that the product itself must not change.
 *   A model that redraws the earrings is worse than no model at all - the
 *   customer receives something other than the picture.
 *
 * WHY REFERENCE IMAGES COME BACK THROUGH CLOUDINARY
 *   Cloudflare's editing model wants references under 512px. Product photos
 *   already live on Cloudinary, which resizes on the URL for free - so instead
 *   of pulling an image processing library into the backend, the reference is
 *   fetched at `w_500,h_500,c_limit`. A URL that is not Cloudinary's is fetched
 *   as-is; if it is too large the provider says 'input' and the next one gets
 *   a turn.
 */
const { ProviderError, cloudflare, pollinations, nvidia, huggingface } = require('./providers');
const { byId, MODELS } = require('./catalog');
const AiProviderState = require('../../models/AiProviderState');
const { periodKeyFor } = require('./catalog');

/* ------------------------------------------------------------------------ */
/* Prompts                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Shared preamble for every EDIT. It is repeated deliberately - models weigh
 * the start of a prompt heaviest, and "do not change the product" is the one
 * instruction that must never be lost.
 */
const KEEP =
  'Keep the exact product from image 0 completely unchanged - same shape, same colours, ' +
  'same materials, same details, same proportions. Do not add, remove or redesign anything on it. ';

/**
 * What kind of thing it is decides where "in use" makes sense. A small model
 * given only "Silver Toe Ring" has put toe rings on fingers and kadas on
 * necks; a hint from the category stops that. Keys are matched against the
 * category name and the product name, first hit wins.
 */
const SCENES = [
  [/toe ring|bichiya/i, 'worn on the second toe of a woman’s foot, foot resting on a light surface'],
  [/anklet|payal|pajeb/i, 'worn on a woman’s ankle'],
  [/earring|jhumka|jhumki|stud|bali|chandbali/i, 'worn on a woman’s ear, head turned slightly'],
  [/necklace|haar|mala|choker|set|mangalsutra|pendant/i, 'worn around a woman’s neck over a plain blouse'],
  [/bangle|kada|kangan|bracelet|chudi/i, 'worn on a woman’s wrist'],
  [/ring/i, 'worn on a woman’s finger, hand resting on a plain surface'],
  [/maang ?tikka|matha ?patti/i, 'worn on a woman’s forehead along the hair parting'],
  [/nose ?pin|nath/i, 'worn on a woman’s nose, close-up'],
  [/saree|kurti|kurta|dress|lehenga|dupatta|shirt|top|jeans|trouser/i, 'worn by a person standing naturally, full garment visible'],
  [/shoe|sandal|jutti|footwear|slipper|heel/i, 'worn on feet, standing on a plain floor'],
  [/bag|purse|clutch|wallet/i, 'held or carried by a person, product fully visible'],
  [/cushion|bedsheet|curtain|rug|decor|lamp|vase|frame|candle/i, 'placed in a simple, tidy Indian living room'],
  [/mug|cup|plate|bowl|bottle|kitchen/i, 'on a clean kitchen counter or dining table'],
  [/phone|earphone|headphone|charger|watch|gadget|speaker/i, 'on a clean desk next to a hand, in use'],
  [/toy|kids|baby/i, 'on a bright, tidy play mat'],
];
const sceneFor = (text) => (SCENES.find(([re]) => re.test(text || '')) || [])[1] || null;

/** "silver toe ring, oxidised silver, silver colour" - facts the seller already typed, so the model need not guess. */
const subjectOf = ({ productName = 'product', category, color, material } = {}) => {
  const bits = [productName];
  if (category && !new RegExp(category.split(/\s+/)[0], 'i').test(productName)) bits.push(`a ${category.toLowerCase().replace(/(?<!s)s$/, '')}`);
  if (material) bits.push(material);
  if (color && !new RegExp(color, 'i').test(productName)) bits.push(`${color} colour`);
  return bits.join(', ');
};

const EDIT_PROMPTS = {
  clean: (name) =>
    `${KEEP}Replace only the background with a clean, pure white studio background. ` +
    `Soft, even e-commerce product lighting, gentle natural shadow beneath, no clutter, no props, ` +
    `sharp focus on the ${name}. Centered, filling most of the frame. Marketplace listing photograph.`,
  lifestyle: (name, _wish, scene) =>
    `${KEEP}Show the ${name} in natural use${scene ? ` - ${scene}` : ' in a tasteful real-life setting appropriate to what it is'}, ` +
    `photographed like a premium Indian lifestyle brand: soft daylight, shallow depth of field, ` +
    `warm neutral tones, nothing that competes with the product. No other products, no text, no logos.`,
  /*
   * The seller's own idea. Their words are appended, never substituted: the
   * rule that the product must not change is ours and comes first, and a
   * closing line keeps it a photograph rather than a poster with text on it.
   */
  custom: (name, wish) =>
    `${KEEP}Now photograph the ${name} exactly as described: ${wish}. ` +
    `Photorealistic, high quality, no text or logos added, the ${name} clearly visible and in focus.`,
};

/** How much a seller may type into a custom scene. Enough for a sentence or three. */
const MAX_WISH = 400;

/* ------------------------------------------------------------------------ */
/* Chains                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Each entry: which provider function, which model, and whether it can take a
 * reference image. Order is quality first, then availability.
 */
/**
 * Chains are ordered lists of CATALOGUE ids (see catalog.js). Quality first,
 * then availability; the standard path never depends on the least reliable
 * provider. A caller may also name ONE id explicitly - the picker in the
 * interface does exactly that - in which case the chain is that one model
 * and nothing else: a person who chose a model wants that model or an honest
 * refusal, not a silent substitute.
 */
const CHAINS = {
  edit: {
    premium: ['hf-flux-kontext-dev', 'pl-gpt-image-2', 'cf-flux-2-klein-9b', 'cf-flux-2-klein-4b', 'pl-flux-kontext-pro'],
    standard: ['cf-flux-2-klein-4b', 'pl-flux-kontext-pro'],
    fast: ['cf-flux-2-klein-4b', 'pl-flux-kontext-pro'],
  },
  generate: {
    premium: ['pl-gpt-image-2', 'cf-flux-2-dev', 'nv-flux-1-dev', 'pl-flux-1-schnell'],
    standard: ['cf-flux-2-klein-4b', 'nv-flux-1-dev', 'pl-flux-1-schnell'],
    fast: ['cf-flux-1-schnell', 'pl-flux-1-schnell'],
  },
};

const TIERS = Object.keys(CHAINS.generate);
const MODES = ['clean', 'lifestyle', 'custom', 'generate'];

/* ------------------------------------------------------------------------ */
/* Reference handling                                                       */
/* ------------------------------------------------------------------------ */

/** Cloudinary resizes on the URL; anyone else's URL is left alone. */
const smallVersionOf = (url) =>
  /res\.cloudinary\.com\/.+\/upload\//.test(url)
    ? url.replace('/upload/', '/upload/w_500,h_500,c_limit,f_jpg,q_auto:good/')
    : url;

const fetchReference = async (url) => {
  const res = await fetch(smallVersionOf(url));
  if (!res.ok) throw new ProviderError('reference', 'input', `could not fetch reference image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
};

/* ------------------------------------------------------------------------ */
/* The one function callers use                                             */
/* ------------------------------------------------------------------------ */

/**
 * @param {object} args
 * @param {'clean'|'lifestyle'|'angle'|'generate'} args.mode
 * @param {'premium'|'standard'|'fast'} [args.tier]
 * @param {string} [args.prompt]        required for `generate`; for `custom`, the seller's
 *                                      description of the scene; ignored by other edits
 * @param {string} [args.imageUrl]      required for edits: the seller's photo
 * @param {string} [args.productName]   used in the edit prompts
 * @param {number} [args.seed]
 * @param {object} [deps]               provider functions, replaceable in tests
 * @returns {Promise<{buffer: Buffer, mime: string, provider: string, model: string, tier: string, attempts: object[]}>}
 */
async function runImage(
  { mode, tier = 'standard', modelId, prompt, imageUrl, productName = 'product', facts = {}, exclude = [], seed },
  deps = { cloudflare, pollinations, nvidia, huggingface, fetchReference, book: bookkeeping }
) {
  if (!MODES.includes(mode)) throw new ProviderError('imageGen', 'input', `unknown mode ${mode}`);
  if (!TIERS.includes(tier)) throw new ProviderError('imageGen', 'input', `unknown tier ${tier}`);

  const isEdit = mode !== 'generate';
  if (isEdit && !imageUrl) throw new ProviderError('imageGen', 'input', 'an edit needs imageUrl');
  if ((!isEdit || mode === 'custom') && !prompt?.trim()) {
    throw new ProviderError('imageGen', 'input', `${mode} needs a description`);
  }

  const wish = mode === 'custom' ? prompt.trim().slice(0, MAX_WISH).replace(/\s+/g, ' ') : null;
  const subject = subjectOf({ productName, ...facts });
  const finalPrompt = isEdit ? EDIT_PROMPTS[mode](subject, wish, sceneFor(`${facts.category || ''} ${productName}`)) : prompt.trim();

  let chain;
  if (modelId) {
    const m = byId[modelId];
    if (!m) throw new ProviderError('imageGen', 'input', `unknown model ${modelId}`);
    if (!m.can.includes(isEdit ? 'edit' : 'generate')) {
      throw new ProviderError('imageGen', 'input', `${m.label} cannot ${isEdit ? 'edit a photo' : 'generate from words'}`);
    }
    chain = [modelId];
  } else {
    // The image gate may send a job back with the model that changed the product excluded.
    chain = CHAINS[isEdit ? 'edit' : 'generate'][tier].filter((id) => !exclude.includes(id));
    if (!chain.length) throw new ProviderError('imageGen', 'upstream', 'every model in this chain has been tried');
  }

  // Fetched once, lazily, only if some entry in the chain wants bytes.
  let referenceBytes = null;
  const attempts = [];

  for (const id of chain) {
    const step = byId[id];
    if (!step) continue;
    try {
      let result;
      if (step.provider === 'cloudflare') {
        let images = [];
        if (isEdit) {
          if (!referenceBytes) referenceBytes = await deps.fetchReference(imageUrl);
          images = [referenceBytes];
        }
        result = await deps.cloudflare(step.remote, { prompt: finalPrompt, images, seed });
      } else if (step.provider === 'pollinations') {
        result = await deps.pollinations(step.remote, {
          prompt: finalPrompt,
          imageUrl: isEdit ? imageUrl : undefined,
          seed,
        });
      } else if (step.provider === 'huggingface') {
        if (!referenceBytes) referenceBytes = await deps.fetchReference(imageUrl);
        result = await deps.huggingface(step.remote, { prompt: finalPrompt, imageBytes: referenceBytes, seed });
      } else {
        result = await deps.nvidia({ prompt: finalPrompt, seed: seed ?? 0 });
      }

      attempts.push({ provider: step.provider, model: step.id, ok: true });
      await deps.book?.success(step);
      return { ...result, provider: step.provider, model: step.id, modelLabel: step.label, tier, attempts };
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : 'upstream';
      attempts.push({ provider: step.provider, model: step.id, ok: false, kind, message: err.message });
      if (kind === 'quota') await deps.book?.exhausted(step, err.message);

      // A bad request is bad everywhere. Stop, and say so.
      if (kind === 'input') {
        const e = new Error(err.message);
        e.statusCode = 400;
        e.attempts = attempts;
        throw e;
      }
      // quota or upstream: the next entry gets its turn.
    }
  }

  const e = new Error(
    (modelId ? `${byId[modelId].label} refused. ` : `Every provider in the ${tier} chain refused. `) +
      attempts.map((a) => `${a.provider}/${a.model}: ${a.kind}`).join('; ')
  );
  e.statusCode = 503;
  e.attempts = attempts;
  throw e;
}

/**
 * The books. Every success adds the model's published cost to the provider's
 * period; every quota refusal marks the provider exhausted for the period.
 * That is what status.js reads to say "available" or "back at 5:30".
 * Failures here are swallowed - a broken ledger must never fail a seller's
 * image.
 */
const bookkeeping = {
  async success(step) {
    try {
      const period = periodKeyFor(step.provider, { day: AiProviderState.day(), month: AiProviderState.month() });
      await AiProviderState.spend(step.provider, period, { model: step.id, cost: step.cost });
      await AiProviderState.markAlive(step.provider, period);
    } catch (err) {
      console.error('AI LEDGER:', err.message);
    }
  },
  async exhausted(step, message) {
    try {
      const period = periodKeyFor(step.provider, { day: AiProviderState.day(), month: AiProviderState.month() });
      await AiProviderState.markExhausted(step.provider, period, message);
    } catch (err) {
      console.error('AI LEDGER:', err.message);
    }
  },
};

module.exports = { runImage, CHAINS, MODES, TIERS, EDIT_PROMPTS, MAX_WISH, smallVersionOf, MODELS };
