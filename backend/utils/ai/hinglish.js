/**
 * Script detection and Devanagari → roman, shared by the assistant and the
 * mic. Small on purpose: a regex for Devanagari, a word list for Hinglish,
 * and one fast model call when text has to be re-written in roman letters.
 *
 * WHY A POST-CHECK EXISTS AT ALL
 *   13 Sep 2026, phone test: the English chip, "Mereko mera payment
 *   chahiye", and the backup model answered in Devanagari despite the
 *   system rule. A rule the model can ignore is not a rule. So the script
 *   of every answer is checked after the fact and fixed when it is wrong -
 *   the person sees Hinglish because the code guarantees it, not because
 *   the model felt like it.
 */
const DEVANAGARI = /[ऀ-ॿ]/;

/* Common Hindi function words as people type them in roman letters. Two
   hits in a sentence and it is Hinglish, whatever else is in it. */
const HINGLISH_WORDS = new Set(
  'mera meri mere mujhe mereko muje hai hain ho hu hoon tha thi the kab kya kyu kyun kaise kaisa kaisi kitna kitni kahan kaha kon kaun nahi nhi na mat aur ya par lekin to toh bhi hi ka ki ke ko se me mein pe par wala wali wale chahiye chaiye karo kar karna karu karun kardo kiya kiye kya hua hoga hogi honge aaya aayega aayegi gaya gayi jao ja raha rahi rahe abhi ab kal aaj phir fir sab kuch koi thoda zyada jyada bahut bhot bohot accha acha theek thik sahi galat batao bata dikhao dekho bolo suno paisa paise rupaye rupee bhai yaar ji please plz'.split(
    ' '
  )
);

/** 'hi' | 'hg' | 'en' - what script a person wrote in. */
const detectScript = (text) => {
  const t = String(text || '');
  if (DEVANAGARI.test(t)) return 'hi';
  const words = t.toLowerCase().match(/[a-z]+/g) || [];
  let hits = 0;
  for (const w of words) if (HINGLISH_WORDS.has(w)) hits += 1;
  return hits >= 2 || (hits >= 1 && words.length <= 3) ? 'hg' : 'en';
};

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Devanagari → roman Hinglish, the way Indians type on WhatsApp. Markdown,
 * links, paths, numbers and order codes are kept. Groq (≈300 ms) first,
 * Gemini after; if both are out the Devanagari stands - a right answer in
 * the wrong script beats no answer.
 */
const toHinglish = async (text, { maxTokens = 400 } = {}) => {
  if (!DEVANAGARI.test(text)) return text;
  const prompt = `Rewrite this text so every Hindi word is in roman letters (Hinglish, as Indians type on WhatsApp). Keep English words, numbers, ₹ amounts, dates, order codes, URLs and paths exactly as they are. Keep the markdown formatting (headings, bullets, bold) exactly. No translation, no additions, no explanation. Output only the rewritten text.\n\n${text}`;
  const key = process.env.GROQ_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: process.env.GROQ_SMALL_MODEL || 'openai/gpt-oss-20b', messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: maxTokens, reasoning_effort: 'low' }),
      });
      const d = await res.json().catch(() => ({}));
      const out = String(d?.choices?.[0]?.message?.content || '').trim();
      if (res.ok && out && !DEVANAGARI.test(out)) return out;
    } catch {
      /* fall through */
    }
  }
  const gkey = process.env.GEMINI_API_KEY;
  if (gkey) {
    try {
      const res = await fetch(`${GEMINI_API}/${process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite'}:generateContent?key=${gkey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: maxTokens } }),
      });
      const d = await res.json().catch(() => ({}));
      const out = (d?.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim();
      if (res.ok && out) return out;
    } catch {
      /* the Devanagari stands */
    }
  }
  return text;
};

module.exports = { detectScript, toHinglish, DEVANAGARI };
