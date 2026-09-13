const { lower, toMessages } = require('./groq');

/**
 * Road 4 for Ask ShopMaster: Cloudflare Workers AI, with our tools (plan 2.25).
 *
 * WHY
 *   Gemini's free tier ran out at 20 requests on 14 Sep 2026, Groq allows
 *   8,000 tokens a minute, and the last road (Pollinations nano) has no
 *   tools at all - it answers from the prefetched context and cannot look
 *   an order up. Cloudflare gives 10,000 neurons a day, and its hosted
 *   Llama 3.3 70B does OpenAI-style function calling, so this is the last
 *   road that can still call getOrder before we fall to guessing. Same
 *   account, same token and gateway as the image editing - no new signup.
 *
 * BUDGET
 *   ~26 neurons per 1k input tokens on the 70B model; a tool round trip on
 *   the compact prompt is ~3k tokens → ~100 neurons → ~90 answers a day if
 *   nothing else used them. The image editor shares the pool, which is why
 *   this is road 4 and not road 1.
 *
 * Wire shape is OpenAI's, so the Groq helpers (schema lowering, message
 * mapping) are reused as they are.
 */
const MODEL = process.env.CF_TEXT_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const endpoint = () => {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const gw = process.env.CLOUDFLARE_AI_GATEWAY;
  if (!acct) return null;
  return gw ? `https://gateway.ai.cloudflare.com/v1/${acct}/${gw}/workers-ai/v1/chat/completions` : `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/v1/chat/completions`;
};

const cloudflareWithTools = async (contents, opts = {}) => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const url = endpoint();
  if (!token || !url) return { ok: false, reason: 'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID is not set' };
  const tools = (opts.declarations || []).map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: lower(d.parameters) } }));
  const messages = [...(opts.system ? [{ role: 'system', content: opts.system }] : []), ...toMessages(contents)];
  const calls = [];
  const maxRounds = opts.maxRounds ?? 3;
  const model = opts.model || MODEL;

  for (let round = 0; round <= maxRounds; round += 1) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.4, max_tokens: 1200, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) }),
      });
    } catch (err) {
      return { ok: false, reason: `Could not reach Cloudflare: ${err.message}` };
    }
    if (!res.ok) return { ok: false, status: res.status, reason: `Cloudflare said ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const data = await res.json().catch(() => null);
    const msg = data?.choices?.[0]?.message;
    if (!msg) return { ok: false, reason: 'Cloudflare returned nothing' };
    if (!msg.tool_calls?.length) {
      const text = String(msg.content || '').trim();
      return text ? { ok: true, text, model: `cloudflare ${model.replace('@cf/', '')}`, calls } : { ok: false, reason: 'Cloudflare returned an empty answer' };
    }
    if (round === maxRounds) return { ok: false, reason: 'Cloudflare kept asking for tools and never answered' };
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        /* malformed arguments: the tool gets none and says so */
      }
      calls.push(name);
      let result;
      try {
        result = await opts.run(name, args);
      } catch (err) {
        result = { error: err.message };
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result ?? {}) });
    }
  }
  return { ok: false, reason: 'Cloudflare never answered' };
};

module.exports = { cloudflareWithTools, MODEL };
