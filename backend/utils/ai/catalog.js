/**
 * The catalogue: every provider, every model, what it costs, and what it can do.
 *
 * ONE PLACE. The chains in imageGen.js, the model picker in the interface,
 * the usage page and the quota bookkeeping all read from here. Add a model
 * here and it appears everywhere; remove it here and it is gone everywhere.
 *
 * COSTS ARE THE PROVIDER'S PUBLISHED RATES, in the provider's own unit, at
 * 1024x1024. They are how we count against an allowance the provider will
 * not report to us. Where a rate is not published the cost is an estimate
 * and says so.
 *
 * RELIABILITY is a rank, not a score: how much the platform should lean on
 * this provider for its everyday path. It is the order in section 4.16 of
 * the plan and the reason the standard chains are Cloudflare-first.
 */

const PROVIDERS = {
  cloudflare: {
    label: 'Cloudflare Workers AI',
    unit: 'neurons',
    period: 'day',
    limit: 10000,
    resetNote: 'Rolling ~24h from first use (observed); Cloudflare documents a daily reset',
    reliability: 1,
    balanceApi: false,
    envKeys: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
  },
  pollinations: {
    label: 'Pollinations',
    unit: 'pollen',
    period: 'total', // no refill on the free tier - a balance, not an allowance
    limit: null,
    resetNote: 'No daily refill on the free tier. Balance comes from one-time quests or top-up',
    reliability: 4,
    balanceApi: true,
    envKeys: ['POLLINATIONS_API_KEY'],
  },
  huggingface: {
    label: 'Hugging Face (Inference Providers)',
    unit: 'usd',
    period: 'month',
    limit: 0.1,
    resetNote: 'Monthly, on the billing period date',
    reliability: 3,
    balanceApi: false,
    envKeys: ['HF_TOKEN'],
  },
  nvidia: {
    label: 'NVIDIA NIM',
    unit: 'credits',
    period: 'total',
    limit: 1000,
    resetNote: 'One-time developer credits; key expires 03/2027',
    reliability: 3,
    balanceApi: false,
    envKeys: ['NVIDIA_API_KEY'],
  },
  gemini: {
    label: 'Google Gemini',
    unit: 'requests',
    period: 'day',
    limit: 250,
    resetNote: 'Daily, midnight Pacific time',
    reliability: 2,
    balanceApi: false,
    envKeys: ['GEMINI_API_KEY'],
  },
};

/**
 * @typedef Model
 * @property {string} id         our stable id, used in requests and the picker
 * @property {string} provider
 * @property {string} label
 * @property {string} remote     the provider's own model id
 * @property {('edit'|'generate'|'text'|'vision')[]} can
 * @property {number} cost       per image/call, in the provider's unit
 * @property {string} quality    'best' | 'high' | 'good' | 'basic'
 * @property {number} [elo]      Artificial Analysis text-to-image ELO, where ranked
 * @property {string} [note]
 */
const MODELS = [
  // --- Cloudflare -------------------------------------------------------
  {
    id: 'cf-flux-2-klein-4b',
    provider: 'cloudflare',
    label: 'FLUX.2 klein 4B',
    remote: '@cf/black-forest-labs/flux-2-klein-4b',
    can: ['edit', 'generate'],
    cost: 125,
    quality: 'good',
    elo: 947,
    note: 'The everyday workhorse: ~80 a day free. Edits from a reference photo.',
  },
  {
    id: 'cf-flux-2-klein-9b',
    provider: 'cloudflare',
    label: 'FLUX.2 klein 9B',
    remote: '@cf/black-forest-labs/flux-2-klein-9b',
    can: ['edit', 'generate'],
    cost: 1364,
    quality: 'high',
    note: 'Sharper than 4B, eleven times the cost: ~7 a day.',
  },
  {
    id: 'cf-flux-2-dev',
    provider: 'cloudflare',
    label: 'FLUX.2 dev',
    remote: '@cf/black-forest-labs/flux-2-dev',
    can: ['generate'],
    cost: 4200,
    quality: 'high',
    elo: 1000,
    note: 'Best open-weights model. ~2 a day - for a banner, not a batch.',
  },
  {
    id: 'cf-flux-1-schnell',
    provider: 'cloudflare',
    label: 'FLUX.1 schnell',
    remote: '@cf/black-forest-labs/flux-1-schnell',
    can: ['generate'],
    cost: 58,
    quality: 'basic',
    note: 'Fast drafts from words. Cannot edit a photo.',
  },
  // --- Pollinations -----------------------------------------------------
  {
    id: 'pl-gpt-image-2',
    provider: 'pollinations',
    label: 'GPT Image 2',
    remote: 'openai/gpt-image-2',
    can: ['edit', 'generate'],
    cost: 0.034,
    quality: 'best',
    elo: 1171,
    note: '#3 in the world. Spends the one-time Pollen balance.',
  },
  {
    id: 'pl-flux-kontext-pro',
    provider: 'pollinations',
    label: 'FLUX.1 Kontext pro',
    remote: 'black-forest-labs/flux.1-kontext-pro',
    can: ['edit'],
    cost: 0.03,
    quality: 'high',
    note: 'Built for editing a photo from an instruction.',
  },
  {
    id: 'pl-flux-1-schnell',
    provider: 'pollinations',
    label: 'FLUX.1 schnell',
    remote: 'black-forest-labs/flux.1-schnell',
    can: ['generate'],
    cost: 0,
    quality: 'basic',
    note: 'Always free, unlimited. Words only.',
  },
  // --- Hugging Face (routed to fal-ai) ----------------------------------
  {
    id: 'hf-flux-kontext-dev',
    provider: 'huggingface',
    label: 'FLUX.1 Kontext dev',
    remote: 'fal-ai/flux-kontext/dev',
    can: ['edit'],
    cost: 0.03,
    quality: 'best',
    note: 'The most faithful edit seen in testing. About three a month on the free credit.',
  },
  // --- NVIDIA -----------------------------------------------------------
  {
    id: 'nv-flux-1-dev',
    provider: 'nvidia',
    label: 'FLUX.1 dev',
    remote: 'black-forest-labs/flux.1-dev',
    can: ['generate'],
    cost: 1,
    quality: 'good',
    note: 'Reserve tank for text-to-image. Cannot take our photo as input.',
  },
  // --- Gemini -----------------------------------------------------------
  {
    id: 'gm-flash',
    provider: 'gemini',
    label: 'Gemini Flash',
    remote: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    can: ['text', 'vision'],
    cost: 1,
    quality: 'high',
    note: 'Reads the photo, writes the listing.',
  },
];

const byId = Object.fromEntries(MODELS.map((m) => [m.id, m]));

/** Is this provider configured at all? Missing keys mean it is simply not offered. */
const configured = (provider) => (PROVIDERS[provider]?.envKeys || []).every((k) => Boolean(process.env[k]));

/** Which period key applies to a provider right now. */
const periodKeyFor = (provider, { day, month }) => {
  const p = PROVIDERS[provider]?.period;
  if (p === 'day') return day;
  if (p === 'month') return month;
  return 'all';
};

module.exports = { PROVIDERS, MODELS, byId, configured, periodKeyFor };
