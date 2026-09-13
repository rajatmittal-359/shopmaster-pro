/**
 * Groq - the assistant's second road when Gemini's free quota is spent.
 *
 * Free tier, no card (console.groq.com), OpenAI-compatible API, and its
 * Llama 3.3 70B does function calling - so the fallback keeps the TOOLS,
 * not only the prose. Pollinations nano stays behind it for the day both
 * are out (no tools there; the prefetch carries the answer).
 *
 * Gemini's declarations are translated on the way in (upper-case types →
 * JSON-schema lower-case, `functionDeclarations` → `tools[].function`) so
 * utils/ai/tools.js is written once. Off entirely until GROQ_API_KEY is set.
 */
const API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

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

  for (let round = 0; round <= maxRounds; round += 1) {
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODEL, messages, temperature: opts.temperature ?? 0.4, max_tokens: 4096, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) }),
      });
    } catch (err) {
      return { ok: false, reason: `Could not reach Groq: ${err.message}` };
    }
    if (!res.ok) return { ok: false, status: res.status, reason: `Groq said ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const data = await res.json().catch(() => null);
    const msg = data?.choices?.[0]?.message;
    if (!msg) return { ok: false, reason: 'Groq returned nothing' };
    if (!msg.tool_calls?.length) {
      const text = String(msg.content || '').trim();
      return text ? { ok: true, text, model: MODEL, calls } : { ok: false, reason: 'Groq returned an empty answer' };
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

module.exports = { groqWithTools, MODEL };
