/**
 * What every provider and model looks like RIGHT NOW - the one answer the
 * interface, the chain and the admin page all read.
 *
 * WHAT COMES BACK, per model
 *   available   true if the key is set AND the provider is not marked
 *               exhausted for this period AND our own count leaves room for
 *               at least one more call
 *   reason      why not, in words a seller can read
 *   remaining   how many more calls we believe fit, or null when unknowable
 *   resetsAt    when we expect it back (ISO), and `resetIsEstimate` says
 *               whether that is published or our arithmetic
 *
 * THREE SOURCES OF TRUTH, IN THIS ORDER
 *   1. The provider said no (a 429/402 today). Recorded as `exhaustedAt`. Wins.
 *   2. The provider's live balance, where there is one (Pollinations).
 *   3. Our own count against the published allowance.
 *   None of them is perfect. Together they are honest: the interface shows
 *   what we know and says when it is guessing.
 */
const AiProviderState = require('../../models/AiProviderState');
const { PROVIDERS, MODELS, configured, periodKeyFor } = require('./catalog');

const HOUR = 60 * 60 * 1000;

/** Pollinations is the one provider that will tell us its balance. */
async function pollinationsBalance() {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://gen.pollinations.ai/account/balance', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.balance === 'number' ? data.balance : null;
  } catch {
    return null;
  }
}

/** Next reset, in IST terms, for the period kinds we track. */
function nextReset(provider, state) {
  const def = PROVIDERS[provider];
  if (def.period === 'total') return { at: null, estimate: false };
  if (state?.exhaustedAt && provider === 'cloudflare') {
    // Observed to behave as a rolling window rather than a midnight reset.
    return { at: new Date(new Date(state.exhaustedAt).getTime() + 24 * HOUR), estimate: true };
  }
  const now = new Date();
  if (def.period === 'day') {
    // Gemini resets at midnight Pacific; Cloudflare documents midnight UTC.
    const tz = provider === 'gemini' ? 'America/Los_Angeles' : 'UTC';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const midnight = new Date(`${parts}T00:00:00Z`);
    const offsetGuess = tz === 'UTC' ? 0 : 7 * HOUR; // PDT; close enough for a "when" label
    return { at: new Date(midnight.getTime() + 24 * HOUR + offsetGuess), estimate: tz !== 'UTC' };
  }
  if (def.period === 'month') {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { at: first, estimate: true };
  }
  return { at: null, estimate: true };
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.live]  ask Pollinations for its balance (one short call)
 * @returns {Promise<{providers: object, models: object[]}>}
 */
async function snapshot({ live = true } = {}) {
  const day = AiProviderState.day();
  const month = AiProviderState.month();

  const rows = await AiProviderState.find({
    $or: Object.keys(PROVIDERS).map((provider) => ({ provider, period: periodKeyFor(provider, { day, month }) })),
  }).lean();
  const stateOf = Object.fromEntries(rows.map((r) => [r.provider, r]));

  const pollen = live ? await pollinationsBalance() : null;

  const providers = {};
  for (const [name, def] of Object.entries(PROVIDERS)) {
    const st = stateOf[name];
    const isConfigured = configured(name);
    const exhaustedToday = Boolean(st?.exhaustedAt);
    const used = st?.used || 0;
    const reset = nextReset(name, st);

    let remainingUnits = null;
    if (name === 'pollinations') {
      // Live when the call answered in time; otherwise the last balance we
      // saw, so a slow provider does not blank the page. Recorded on `used`
      // for this provider, which for a balance means "last known".
      remainingUnits = pollen != null ? pollen : st?.lastBalance ?? null;
      if (pollen != null) {
        AiProviderState.updateOne({ provider: name, period: 'all' }, { $set: { lastBalance: pollen } }, { upsert: true }).catch(() => {});
      }
    } else if (def.limit != null) remainingUnits = Math.max(0, def.limit - used);

    providers[name] = {
      label: def.label,
      unit: def.unit,
      period: def.period,
      limit: def.limit,
      used,
      calls: st?.calls || 0,
      remainingUnits,
      configured: isConfigured,
      exhausted: exhaustedToday,
      exhaustedAt: st?.exhaustedAt || null,
      lastError: st?.lastError || '',
      resetsAt: reset.at,
      resetIsEstimate: reset.estimate,
      resetNote: def.resetNote,
      reliability: def.reliability,
      balanceIsLive: name === 'pollinations' && pollen != null,
    };
  }

  const models = MODELS.map((m) => {
    const p = providers[m.provider];
    let available = p.configured && !p.exhausted;
    let reason = '';
    let remaining = null;

    if (!p.configured) reason = 'Not set up on this server';
    else if (p.exhausted) reason = `Free allowance used up${p.resetsAt ? ' - back ' + whenWord(p.resetsAt, p.resetIsEstimate) : ''}`;
    else if (p.remainingUnits != null && m.cost > 0) {
      remaining = Math.floor(p.remainingUnits / m.cost);
      if (remaining < 1) {
        available = false;
        reason = `Not enough ${p.unit} left for one more (${p.remainingUnits.toFixed ? p.remainingUnits.toFixed(3) : p.remainingUnits} ${p.unit})`;
      }
    } else if (m.cost === 0) remaining = Infinity;

    return {
      ...m,
      providerLabel: p.label,
      available,
      reason,
      remaining: remaining === Infinity ? null : remaining,
      unlimited: remaining === Infinity,
      resetsAt: p.resetsAt,
      resetIsEstimate: p.resetIsEstimate,
    };
  });

  return { providers, models, at: new Date().toISOString() };
}

function whenWord(at, estimate) {
  const d = new Date(at);
  const s = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
  return estimate ? `around ${s} (estimated)` : s;
}

module.exports = { snapshot, whenWord };
