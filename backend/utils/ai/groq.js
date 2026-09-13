/**
 * Groq - the assistant's second road when Gemini's free quota is spent.
 *
 * Free tier, no card (console.groq.com), OpenAI-compatible API, and its
 * gpt-oss-120b does function calling - so the fallback keeps the TOOLS,
 * not only the prose. Pollinations nano stays behind it for the day both
 * are out (no tools there; the prefetch carries the answer).
 *
 * Gemini's declarations are translated on the way in (upper-case types →
 * JSON-schema lower-case, `functionDeclarations` → `tools[].function`) so
 * utils/ai/tools.js is written once. Off entirely until GROQ_API_KEY is set.
 */
const API = `${require('./endpoints').GROQ_OPENAI}/chat/completions`;

/*
 * THE BUDGET, READ FROM GROQ ITSELF
 *   Every response carries x-ratelimit-remaining-tokens / -requests and the
 *   time to reset. Remembered per model here, so a road that cannot fit the
 *   next prompt is skipped without a call - a 429 costs a round trip and a
 *   log line, and on the free tier (8,000 tokens a minute on the chat
 *   models) it would be the normal case for the second question in a minute.
 *   Estimates are rough (chars/3.6); the point is to avoid the obvious.
 */
const budget = new Map(); // model -> { tokens, requests, tokensResetAt, requestsResetAt }
const secondsOf = (s) => {
  // "1m2.5s", "51m50.399s", "8ms", "2s"
  const m = String(s || '').match(/(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:(\d+)ms)?/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) + Number(m[4] || 0) / 1000;
};
const remember = (model, res) => {
  if (!res?.headers?.get) return;
  const tokens = Number(res.headers.get('x-ratelimit-remaining-tokens'));
  const requests = Number(res.headers.get('x-ratelimit-remaining-requests'));
  if (Number.isNaN(tokens) && Number.isNaN(requests)) return;
  budget.set(model, {
    tokens: Number.isNaN(tokens) ? Infinity : tokens,
    requests: Number.isNaN(requests) ? Infinity : requests,
    tokensResetAt: Date.now() + secondsOf(res.headers.get('x-ratelimit-reset-tokens')) * 1000,
    requestsResetAt: Date.now() + secondsOf(res.headers.get('x-ratelimit-reset-requests')) * 1000,
  });
};
const estimateTokens = (messages) => Math.ceil(JSON.stringify(messages).length / 3.6);
/** null when the road may be tried; a reason when it cannot fit right now. */
const cannotFit = (model, messages) => {
  const b = budget.get(model);
  if (!b) return null;
  const now = Date.now();
  if (b.requests <= 0 && b.requestsResetAt > now) return `Groq ${model}: no requests left for ${Math.ceil((b.requestsResetAt - now) / 60000)} min`;
  const need = estimateTokens(messages) + 600;
  if (b.tokens < need && b.tokensResetAt > now) return `Groq ${model}: ${b.tokens} tokens left this minute, need ~${need}`;
  return null;
};
// Checked against the account's model list on 13 Sep 2026: the Llama 3.x
// models are gone; gpt-oss-120b is the strongest tool-calling model served free.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const lower = (schema) => {
  if (Array.isArray(schema)) return schema.map(lower);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : lower(v);
  return out;
};

const toMessages = (contents) =>
  contents.map((c) => ({ role: c.role === 'model' ? 'assistant' : 'user', content: c.parts.map((p) => p.text || '').join('') }));

const groqWithTools = async (contents, opts = {}) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: 'GROQ_API_KEY is not set' };
  const tools = (opts.declarations || []).map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: lower(d.parameters) } }));
  const messages = [...(opts.system ? [{ role: 'system', content: opts.system }] : []), ...toMessages(contents)];
  const calls = [];
  const maxRounds = opts.maxRounds ?? 6;
  const model = opts.model || MODEL;
  const skip = cannotFit(model, messages);
  if (skip) return { ok: false, status: 429, reason: skip, skipped: true };

  for (let round = 0; round <= maxRounds; round += 1) {
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.4, max_tokens: 4096, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) }),
      });
    } catch (err) {
      return { ok: false, reason: `Could not reach Groq: ${err.message}` };
    }
    remember(model, res);
    if (!res.ok) return { ok: false, status: res.status, reason: `Groq said ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const data = await res.json().catch(() => null);
    const msg = data?.choices?.[0]?.message;
    if (!msg) return { ok: false, reason: 'Groq returned nothing' };
    if (!msg.tool_calls?.length) {
      const text = String(msg.content || '').trim();
      return text ? { ok: true, text, model, calls } : { ok: false, reason: 'Groq returned an empty answer' };
    }
    if (round === maxRounds) return { ok: false, reason: 'Groq kept asking for tools and never answered' };
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
  return { ok: false, reason: 'Groq did not answer' };
};

/**
 * Plain chat, no custom tools - for models that do not take them
 * (groq/compound-mini has its own web search and a 70k/minute allowance;
 * it is the road that stays open when the 8k models are busy).
 */
const groqPlain = async (contents, opts = {}) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: 'GROQ_API_KEY is not set' };
  const model = opts.model || 'groq/compound-mini';
  const messages = [...(opts.system ? [{ role: 'system', content: opts.system }] : []), ...toMessages(contents)];
  const skip = cannotFit(model, messages);
  if (skip) return { ok: false, status: 429, reason: skip, skipped: true };
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.4, max_tokens: 2048 }),
    });
  } catch (err) {
    return { ok: false, reason: `Could not reach Groq: ${err.message}` };
  }
  remember(model, res);
  if (!res.ok) return { ok: false, status: res.status, reason: `Groq said ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
  const data = await res.json().catch(() => null);
  const msg = data?.choices?.[0]?.message;
  const text = String(msg?.content || '').trim();
  if (!text) return { ok: false, reason: 'Groq returned an empty answer' };
  // compound reports the tools it used itself (search, code) under executed_tools
  const searchedWeb = Boolean(msg?.executed_tools?.some?.((t) => /search/i.test(t.type || t.name || '')));
  return { ok: true, text, model, calls: [], searchedWeb };
};

module.exports = { groqWithTools, groqPlain, MODEL, budget, cannotFit, secondsOf };
