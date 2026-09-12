const mongoose = require('mongoose');

/**
 * What we know about each AI provider's free allowance, right now.
 *
 * WHY THIS EXISTS
 *   Rajat's requirement: whoever is using the AI - admin, seller, or us -
 *   should see every provider and model, which are available, which have hit
 *   their limit, what the limit is, and when it comes back. Only one provider
 *   (Pollinations) tells us its balance over the API. The rest say nothing
 *   until they say 429. So we keep our own books:
 *
 *     used      what we have spent today, in the provider's own unit
 *               (Cloudflare neurons, HF dollars, NVIDIA credits, Gemini calls)
 *     limit     the published free allowance per period
 *     exhaustedAt   the moment a 429/402 last came back, if today
 *     resetsAt  when we expect the allowance back - published where the
 *               provider publishes it, otherwise exhaustedAt + period, and
 *               LABELLED as an estimate wherever it is one
 *
 * ONE ROW PER PROVIDER PER PERIOD
 *   `period` is the day (IST) for daily allowances and the month for monthly
 *   ones. A new period is a new row, so the old one is history.
 *
 * WHAT IT IS NOT
 *   Authoritative. A provider can change its free tier without telling us,
 *   and the first sign will be a 429 earlier than expected. That is why
 *   `exhaustedAt` is recorded from the provider's answer and always wins over
 *   our arithmetic.
 */
const aiProviderStateSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true }, // cloudflare | pollinations | huggingface | nvidia | gemini
    period: { type: String, required: true }, // YYYY-MM-DD or YYYY-MM, IST
    used: { type: Number, default: 0 },
    calls: { type: Number, default: 0 },
    byModel: { type: Map, of: Number, default: {} }, // model -> calls
    exhaustedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    // For providers that report a balance: the last one we saw, so the page
    // still says something when the live call is slow.
    lastBalance: { type: Number, default: null },
  },
  { timestamps: true }
);

aiProviderStateSchema.index({ provider: 1, period: 1 }, { unique: true });

const IST = 'Asia/Kolkata';
aiProviderStateSchema.statics.day = () => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
aiProviderStateSchema.statics.month = () => aiProviderStateSchema.statics.day().slice(0, 7);

/** Record a successful call and what it cost in the provider's unit. */
aiProviderStateSchema.statics.spend = async function (provider, period, { model, cost = 0 }) {
  await this.updateOne(
    { provider, period },
    { $inc: { used: cost, calls: 1, [`byModel.${model}`]: 1 } },
    { upsert: true }
  );
};

/** Record that the provider refused for quota. This is the truth; arithmetic is the estimate. */
aiProviderStateSchema.statics.markExhausted = async function (provider, period, message = '') {
  await this.updateOne(
    { provider, period },
    { $set: { exhaustedAt: new Date(), lastError: String(message).slice(0, 200) } },
    { upsert: true }
  );
};

/** Clear an exhausted mark - a call just succeeded, so the allowance is back. */
aiProviderStateSchema.statics.markAlive = async function (provider, period) {
  await this.updateOne({ provider, period }, { $set: { exhaustedAt: null, lastError: '' } }, { upsert: true });
};

module.exports = mongoose.model('AiProviderState', aiProviderStateSchema);
