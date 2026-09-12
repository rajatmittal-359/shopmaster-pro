/**
 * The image providers, one function each, behind one shape.
 *
 * WHY THREE PROVIDERS AND NOT ONE
 *   None of them is free enough alone. Pollinations carries the best model on
 *   earth right now (gpt-image-2, #3 on the blind-vote leaderboard) but its
 *   free Pollen covers roughly seven of those a day. Cloudflare carries the
 *   FLUX.2 family on 10,000 free neurons a day - which is two of the big model,
 *   or eighty of the small one - and the editing model this whole feature
 *   depends on. NVIDIA holds
 *   a one-time credit balance that makes a decent reserve tank. Together they
 *   are a free tier that behaves like a paid one; apart, each runs out.
 *
 * WHAT EVERY FUNCTION HERE PROMISES
 *   Resolve to `{ buffer, mime }` on success, or throw a ProviderError whose
 *   `kind` says whether the NEXT provider should be tried:
 *     - 'quota'   the free allowance is spent (402, 429, "insufficient")
 *     - 'input'   the request itself was wrong - do not retry anywhere
 *     - 'upstream' the provider failed for its own reasons - try the next
 *   The fallback logic in imageGen.js reads `kind` and nothing else.
 *
 * NO NEW DEPENDENCY
 *   Node 22's fetch, FormData and Blob. Same decision as gemini.js and the
 *   Brevo move: an SDK per provider is three more things to pin and update
 *   for what is, every time, one HTTP POST.
 *
 * NOTHING IN HERE KNOWS ABOUT SELLERS, PRODUCTS OR QUOTAS PER PERSON
 *   That is imageGen.js and the controller. This file knows how to talk to
 *   three APIs and how each one says no.
 */

class ProviderError extends Error {
  constructor(provider, kind, message, status) {
    super(`${provider}: ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind; // 'quota' | 'input' | 'upstream'
    this.status = status;
  }
}

const classify = (status, body = '') => {
  if (status === 402 || status === 429 || /insufficient|quota|balance|exceeded/i.test(body)) {
    return 'quota';
  }
  if (status === 400 || status === 413 || status === 422) return 'input';
  return 'upstream';
};

/** A bounded read of an error body, for the log and nothing else. */
const readError = async (res) => (await res.text().catch(() => '')).slice(0, 300);

/* ------------------------------------------------------------------------ */
/* Cloudflare Workers AI                                                    */
/* ------------------------------------------------------------------------ */

/*
 * WHAT EACH ONE COSTS, because the free day is 10,000 neurons and the first
 * afternoon of testing spent all of them on eight images before anyone had
 * checked. At 1024x1024, from Cloudflare's published rates:
 *
 *   flux-2-dev        ~3,750-5,600 neurons   about 2 a day
 *   flux-2-klein-9b   ~1,364                 about 7 a day
 *   flux-2-klein-4b   ~125                   about 80 a day   <- the workhorse
 *   flux-1-schnell    ~58                    about 170 a day, text-to-image only
 *
 * "230 free images a day" - the number in every blog post - is schnell's.
 * The FLUX.2 models are a different order of magnitude, and the chains in
 * imageGen.js are built around that, not around the blog post.
 */
const CF_MODELS = {
  // Best open-weights model available anywhere free. ~10s. Text-to-image.
  // Two a day: premium-chain material, not a default.
  'flux-2-dev': '@cf/black-forest-labs/flux-2-dev',
  // Generation AND editing. ~3s. Excellent - and 1,364 neurons each, so it is
  // the second step of the premium chain, not the standard one.
  'flux-2-klein-9b': '@cf/black-forest-labs/flux-2-klein-9b',
  // Same family, ~125 neurons. Editing at eighty a day is the whole point of
  // this provider. Reference images go in as input_image_0..3, under 512px.
  'flux-2-klein-4b': '@cf/black-forest-labs/flux-2-klein-4b',
  // Fast and cheap. Text-to-image only.
  'flux-1-schnell': '@cf/black-forest-labs/flux-1-schnell',
};

/**
 * @param {string} model     a key of CF_MODELS
 * @param {object} args
 * @param {string} args.prompt
 * @param {Buffer[]} [args.images]  reference images, already <= 512px each
 * @param {number} [args.width]
 * @param {number} [args.height]
 * @param {number} [args.steps]
 * @param {number} [args.seed]
 */
async function cloudflare(model, { prompt, images = [], width = 1024, height = 1024, steps, seed }) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new ProviderError('cloudflare', 'upstream', 'not configured');

  // Either our short alias or the provider's own id, so the catalogue can
  // hand over `remote` directly.
  const id = CF_MODELS[model] || (model.startsWith('@cf/') ? model : null);
  if (!id) throw new ProviderError('cloudflare', 'input', `unknown model ${model}`);

  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${id}`;
  const headers = { Authorization: `Bearer ${token}` };

  let res;
  if (id === '@cf/black-forest-labs/flux-1-schnell') {
    // The one that still takes JSON.
    res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps: steps ?? 4, ...(seed != null ? { seed } : {}) }),
    });
  } else {
    /*
     * The FLUX.2 models take multipart even for a bare prompt, because the
     * same endpoint accepts reference images. Field names are not in the
     * published schema - `input_image_N` was found by reading Cloudflare's
     * changelog, after `images`, `image` and `input_image` were all silently
     * ignored and the model drew a water bottle for a pair of earrings.
     */
    const fd = new FormData();
    fd.append('prompt', prompt);
    fd.append('width', String(width));
    fd.append('height', String(height));
    if (steps != null) fd.append('steps', String(steps));
    if (seed != null) fd.append('seed', String(seed));
    images.slice(0, 4).forEach((buf, i) => {
      fd.append(`input_image_${i}`, new Blob([buf], { type: 'image/jpeg' }), `ref-${i}.jpg`);
    });
    res = await fetch(url, { method: 'POST', headers, body: fd });
  }

  if (!res.ok) {
    const body = await readError(res);
    throw new ProviderError('cloudflare', classify(res.status, body), `${res.status} ${body}`, res.status);
  }

  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const data = await res.json();
    const b64 = data?.result?.image;
    if (!b64) throw new ProviderError('cloudflare', 'upstream', 'no image in response');
    return { buffer: Buffer.from(b64, 'base64'), mime: 'image/png' };
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: type.split(';')[0] || 'image/png' };
}

/* ------------------------------------------------------------------------ */
/* Pollinations                                                             */
/* ------------------------------------------------------------------------ */

const POLLINATIONS_MODELS = {
  // #3 on the text-to-image leaderboard. The premium tier. ~0.034 Pollen each.
  'gpt-image-2': 'openai/gpt-image-2',
  // Always free, unlimited. The floor nothing falls below.
  'flux-1-schnell': 'black-forest-labs/flux.1-schnell',
  // Built for editing an existing photo from an instruction. Free.
  'flux-1-kontext-pro': 'black-forest-labs/flux.1-kontext-pro',
};

/**
 * Pollinations takes the prompt in the PATH and, for editing, the source
 * image as a public URL in `image`. Product photos live on Cloudinary, so a
 * URL is what we have anyway.
 */
async function pollinations(model, { prompt, imageUrl, width = 1024, height = 1024, seed }) {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) throw new ProviderError('pollinations', 'upstream', 'not configured');

  const id = POLLINATIONS_MODELS[model] || (model.includes('/') ? model : null);
  if (!id) throw new ProviderError('pollinations', 'input', `unknown model ${model}`);

  const url = new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`);
  url.searchParams.set('model', id);
  url.searchParams.set('width', String(width));
  url.searchParams.set('height', String(height));
  url.searchParams.set('nologo', 'true');
  url.searchParams.set('private', 'true');
  if (seed != null) url.searchParams.set('seed', String(seed));
  if (imageUrl) url.searchParams.set('image', imageUrl);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    const body = await readError(res);
    throw new ProviderError('pollinations', classify(res.status, body), `${res.status} ${body}`, res.status);
  }
  const type = res.headers.get('content-type') || 'image/jpeg';
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: type.split(';')[0] };
}

/* ------------------------------------------------------------------------ */
/* NVIDIA NIM                                                               */
/* ------------------------------------------------------------------------ */

/**
 * FLUX.1 dev on NVIDIA's free developer credits. Older than FLUX.2 and it
 * showed - asked for chandbali it drew studs - so this is the reserve tank,
 * reached only when the other two have both said no.
 */
async function nvidia({ prompt, width = 1024, height = 1024, steps = 30, seed = 0 }) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new ProviderError('nvidia', 'upstream', 'not configured');

  const res = await fetch('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode: 'base', width, height, steps, seed, cfg_scale: 3.5 }),
  });
  if (!res.ok) {
    const body = await readError(res);
    throw new ProviderError('nvidia', classify(res.status, body), `${res.status} ${body}`, res.status);
  }
  const data = await res.json();
  const b64 = data?.artifacts?.[0]?.base64;
  if (!b64) throw new ProviderError('nvidia', 'upstream', 'no artifact in response');
  return { buffer: Buffer.from(b64, 'base64'), mime: 'image/png' };
}

/* ------------------------------------------------------------------------ */
/* Hugging Face Inference Providers (routed to fal-ai)                       */
/* ------------------------------------------------------------------------ */

/**
 * FLUX.1 Kontext dev through Hugging Face's router, which fronts fal-ai. The
 * most faithful edit seen in testing - same beads, same hooks, white
 * background, four seconds - on the free account's $0.10 a month, which is
 * about three images. A reserve for the picture that matters, not a daily
 * path.
 *
 * The router speaks fal's own request shape: `image_url` may be a data URL,
 * and the answer is JSON with a hosted URL to fetch. Two round trips per
 * image, both short.
 */
async function huggingface(model, { prompt, imageBytes, seed }) {
  const key = process.env.HF_TOKEN;
  if (!key) throw new ProviderError('huggingface', 'upstream', 'not configured');
  if (!imageBytes) throw new ProviderError('huggingface', 'input', 'Kontext needs a reference image');

  const res = await fetch(`https://router.huggingface.co/fal-ai/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_url: `data:image/jpeg;base64,${imageBytes.toString('base64')}`,
      num_inference_steps: 28,
      guidance_scale: 2.5,
      ...(seed != null ? { seed } : {}),
    }),
  });
  if (!res.ok) {
    const body = await readError(res);
    throw new ProviderError('huggingface', classify(res.status, body), `${res.status} ${body}`, res.status);
  }
  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new ProviderError('huggingface', 'upstream', 'no image in response');
  const img = await fetch(url);
  if (!img.ok) throw new ProviderError('huggingface', 'upstream', `could not fetch result (${img.status})`);
  return { buffer: Buffer.from(await img.arrayBuffer()), mime: (img.headers.get('content-type') || 'image/jpeg').split(';')[0] };
}

module.exports = { ProviderError, cloudflare, pollinations, nvidia, huggingface, CF_MODELS, POLLINATIONS_MODELS };

