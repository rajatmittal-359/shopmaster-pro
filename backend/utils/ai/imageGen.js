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
 *     angle      same product, another view
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
const { ProviderError, cloudflare, pollinations, nvidia } = require('./providers');

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

const EDIT_PROMPTS = {
  clean: (name) =>
    `${KEEP}Replace only the background with a clean, pure white studio background. ` +
    `Soft, even e-commerce product lighting, gentle natural shadow beneath, no clutter, no props, ` +
    `sharp focus on the ${name}. Centered, filling most of the frame. Marketplace listing photograph.`,
  lifestyle: (name) =>
    `${KEEP}Show the ${name} in natural use in a tasteful real-life setting appropriate to what it is, ` +
    `photographed like a premium Indian lifestyle brand: soft daylight, shallow depth of field, ` +
    `warm neutral tones, nothing that competes with the product.`,
  angle: (name) =>
    `${KEEP}Photograph the same ${name} from a different angle - a three-quarter view - ` +
    `on the same clean white studio background, same lighting, so it can sit beside the original ` +
    `as a second listing photo.`,
};

/* ------------------------------------------------------------------------ */
/* Chains                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Each entry: which provider function, which model, and whether it can take a
 * reference image. Order is quality first, then availability.
 */
const CHAINS = {
  edit: {
    premium: [
      { provider: 'pollinations', model: 'gpt-image-2', reference: 'url' },
      { provider: 'cloudflare', model: 'flux-2-klein-9b', reference: 'buffer' },
      { provider: 'cloudflare', model: 'flux-2-klein-4b', reference: 'buffer' },
      { provider: 'pollinations', model: 'flux-1-kontext-pro', reference: 'url' },
    ],
    standard: [
      { provider: 'cloudflare', model: 'flux-2-klein-4b', reference: 'buffer' },
      { provider: 'pollinations', model: 'flux-1-kontext-pro', reference: 'url' },
    ],
    fast: [
      { provider: 'cloudflare', model: 'flux-2-klein-4b', reference: 'buffer' },
      { provider: 'pollinations', model: 'flux-1-kontext-pro', reference: 'url' },
    ],
  },
  generate: {
    premium: [
      { provider: 'pollinations', model: 'gpt-image-2' },
      { provider: 'cloudflare', model: 'flux-2-dev' },
      { provider: 'nvidia', model: 'flux-1-dev' },
      { provider: 'pollinations', model: 'flux-1-schnell' },
    ],
    standard: [
      { provider: 'cloudflare', model: 'flux-2-klein-4b' },
      { provider: 'nvidia', model: 'flux-1-dev' },
      { provider: 'pollinations', model: 'flux-1-schnell' },
    ],
    fast: [
      { provider: 'cloudflare', model: 'flux-1-schnell' },
      { provider: 'pollinations', model: 'flux-1-schnell' },
    ],
  },
};

const TIERS = Object.keys(CHAINS.generate);
const MODES = ['clean', 'lifestyle', 'angle', 'generate'];

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
 * @param {string} [args.prompt]        required for `generate`; ignored for edits
 * @param {string} [args.imageUrl]      required for edits: the seller's photo
 * @param {string} [args.productName]   used in the edit prompts
 * @param {number} [args.seed]
 * @param {object} [deps]               provider functions, replaceable in tests
 * @returns {Promise<{buffer: Buffer, mime: string, provider: string, model: string, tier: string, attempts: object[]}>}
 */
async function runImage(
  { mode, tier = 'standard', prompt, imageUrl, productName = 'product', seed },
  deps = { cloudflare, pollinations, nvidia, fetchReference }
) {
  if (!MODES.includes(mode)) throw new ProviderError('imageGen', 'input', `unknown mode ${mode}`);
  if (!TIERS.includes(tier)) throw new ProviderError('imageGen', 'input', `unknown tier ${tier}`);

  const isEdit = mode !== 'generate';
  if (isEdit && !imageUrl) throw new ProviderError('imageGen', 'input', 'an edit needs imageUrl');
  if (!isEdit && !prompt?.trim()) throw new ProviderError('imageGen', 'input', 'generate needs a prompt');

  const finalPrompt = isEdit ? EDIT_PROMPTS[mode](productName) : prompt.trim();
  const chain = CHAINS[isEdit ? 'edit' : 'generate'][tier];

  // Fetched once, lazily, only if some entry in the chain wants bytes.
  let referenceBytes = null;
  const attempts = [];

  for (const step of chain) {
    try {
      let result;
      if (step.provider === 'cloudflare') {
        let images = [];
        if (isEdit) {
          if (!referenceBytes) referenceBytes = await deps.fetchReference(imageUrl);
          images = [referenceBytes];
        }
        result = await deps.cloudflare(step.model, { prompt: finalPrompt, images, seed });
      } else if (step.provider === 'pollinations') {
        result = await deps.pollinations(step.model, {
          prompt: finalPrompt,
          imageUrl: isEdit ? imageUrl : undefined,
          seed,
        });
      } else {
        result = await deps.nvidia({ prompt: finalPrompt, seed: seed ?? 0 });
      }

      attempts.push({ provider: step.provider, model: step.model, ok: true });
      return { ...result, provider: step.provider, model: step.model, tier, attempts };
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : 'upstream';
      attempts.push({ provider: step.provider, model: step.model, ok: false, kind, message: err.message });

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
    `Every provider in the ${tier} chain refused. ` +
      attempts.map((a) => `${a.provider}/${a.model}: ${a.kind}`).join('; ')
  );
  e.statusCode = 503;
  e.attempts = attempts;
  throw e;
}

module.exports = { runImage, CHAINS, MODES, TIERS, EDIT_PROMPTS, smallVersionOf };
