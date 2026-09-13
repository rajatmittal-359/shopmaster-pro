/**
 * "Bol ke listing" - the numbers and nouns out of what a shopkeeper said.
 *
 *   "oxidised silver ka kada, 1250 rupaye, MRP 1800, 5 piece, free size"
 *   → { name: 'Oxidised silver kada', price: 1250, mrp: 1800, stock: 5, size: 'Free size', color: 'silver' }
 *
 * The rest of the listing (description, category, tags, gender) is what
 * draftListing already does from words in any language; this only pulls out
 * the fields that are NUMBERS or short labels, which a prose model gets
 * wrong more often than a regex does. A small, fast model reads the sentence
 * (Groq gpt-oss-20b, ~300 ms; Gemini flash-lite behind it); a regex pass
 * runs regardless and fills anything the model left empty, so the form gets
 * the price even when every model is out.
 */
const { GEMINI_MODELS: GEMINI_API, GROQ_OPENAI } = require('./endpoints');

const SCHEMA_TEXT = `{"name": string|null (short product name in simple English, e.g. "Oxidised silver kada"), "price": number|null (selling price in rupees), "mrp": number|null (MRP if a second, higher price is said), "stock": number|null (how many pieces), "color": string|null (one colour in English), "size": string|null (e.g. "Free size", "M", "2.6"), "material": string|null (e.g. "oxidised silver", "cotton")}`;

const prompt = (transcript) => `A shopkeeper in India described a product out loud (Hindi, Hinglish or English). Extract ONLY what was said into this JSON, null when not said. Numbers: "rupaye/rupees/rs/₹" = price; the higher of two prices is the MRP; "piece/pcs/nag/quantity/stock" = stock. Do not invent. Output only the JSON.
${SCHEMA_TEXT}

Said: "${String(transcript).slice(0, 600)}"`;

const parseJson = (text) => {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
};

const viaGroq = async (transcript) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${GROQ_OPENAI}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.GROQ_SMALL_MODEL || 'openai/gpt-oss-20b', messages: [{ role: 'user', content: prompt(transcript) }], temperature: 0, max_tokens: 300, reasoning_effort: 'low', response_format: { type: 'json_object' } }),
    });
    const d = await res.json().catch(() => ({}));
    return res.ok ? parseJson(d?.choices?.[0]?.message?.content) : null;
  } catch {
    return null;
  }
};

const viaGemini = async (transcript) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${GEMINI_API}/${process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite'}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt(transcript) }] }], generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: 'application/json' } }),
    });
    const d = await res.json().catch(() => ({}));
    return res.ok ? parseJson((d?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')) : null;
  } catch {
    return null;
  }
};

/* Devanagari and roman number words a shopkeeper actually says. */
const WORD_NUMBERS = { ek: 1, do: 2, teen: 3, chaar: 4, char: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10, bees: 20, pachas: 50, sau: 100, hazaar: 1000, hazar: 1000, एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, बीस: 20, पचास: 50, सौ: 100, हज़ार: 1000, हजार: 1000 };
const num = (s) => {
  const t = String(s || '').toLowerCase().replace(/,/g, '');
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  if (WORD_NUMBERS[t] != null) return WORD_NUMBERS[t];
  return null;
};

/** The regex pass: rupees, MRP, pieces, sizes. Fills what the model missed. */
const byRegex = (transcript) => {
  const t = String(transcript || '');
  const out = {};
  const clean = (x) => Number(String(x).replace(/,/g, ''));
  const mrp = t.match(/(?:mrp|एमआरपी|m\.?r\.?p\.?)\s*(?:hai|है|:)?\s*(?:₹|rs\.?)?\s*([\d,]+)/i);
  if (mrp) out.mrp = clean(mrp[1]);
  const money = [
    ...t.matchAll(/(?:₹|rs\.?|rupees?|rupaye|रुपये|रुपए|रु\.?|price|daam|dam|दाम|rate|cost)\s*(?:hai|है|:)?\s*([\d,]+(?:\.\d+)?)/gi),
    ...t.matchAll(/([\d,]+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|rupaye|रुपये|रुपए|रु\b|ka|ki|ke|का|की|के)\b/gi),
  ]
    .map((m) => clean(m[1]))
    .filter((n, i, arr) => n > 0 && n !== out.mrp && arr.indexOf(n) === i); // "₹2,499 ka" matches twice
  if (money.length) out.price = Math.min(...money);
  if (!out.mrp && money.length >= 2) out.mrp = Math.max(...money);
  const used = new Set([out.price, out.mrp]);
  const stockHits = [
    // no trailing \b: Devanagari letters are not "word" characters to the regex engine
    ...t.matchAll(/(\d+|[a-zऀ-ॿ]+)\s*(?:piece|pieces|pcs|pc|nag|नग|पीस|units?|items?)(?=\s|$|[,.।])/gi),
    ...t.matchAll(/(?:quantity|stock|qty)\s*(?:hai|है|:)?\s*(\d+)/gi),
  ]
    .map((m) => num(m[1]))
    .filter((n) => n != null && !used.has(n));
  if (stockHits.length) out.stock = stockHits[0];
  const size = t.match(/\b(free size|one size|xs|s|m|l|xl|xxl|xxxl|\d{1,2}(?:\.\d)?\s*(?:inch|इंच)|\d\.\d)\b/i);
  if (size) out.size = size[1].replace(/\b\w/g, (c) => c.toUpperCase());
  return out;
};

/**
 * @returns {Promise<{facts: object, via: 'groq'|'gemini'|'regex'}>}
 */
const factsFromSpeech = async (transcript) => {
  const regex = byRegex(transcript);
  let model = await viaGroq(transcript);
  let via = 'groq';
  if (!model) {
    model = await viaGemini(transcript);
    via = model ? 'gemini' : 'regex';
  }
  const m = model || {};
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null);
  const facts = {
    name: s(m.name),
    price: n(m.price) ?? regex.price ?? null,
    mrp: n(m.mrp) ?? regex.mrp ?? null,
    stock: n(m.stock) ?? regex.stock ?? null,
    color: s(m.color),
    size: s(m.size) ?? regex.size ?? null,
    material: s(m.material),
  };
  // A price above its MRP is a slip of the tongue, not a rule to save.
  if (facts.price && facts.mrp && facts.mrp < facts.price) [facts.price, facts.mrp] = [facts.mrp, facts.price];
  return { facts, via };
};

module.exports = { factsFromSpeech, byRegex };
