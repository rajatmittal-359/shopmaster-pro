/**
 * Awaaz → text. The mic behind Ask ShopMaster, the search bar and
 * "bol ke listing".
 *
 * WHY
 *   The person running Charming Jewels day to day is a 1970s-generation
 *   shopkeeper on a phone, Hindi first. Typing a question in Hinglish is the
 *   barrier; saying it is not. Flipkart and Meesho put a mic in the search
 *   bar for the same reason - most of their orders come from people who
 *   would rather speak than type.
 *
 * ROADS
 *   1. Groq Whisper large-v3-turbo: free (2,000 requests/day, two hours of
 *      audio per hour), fast, good Hindi and Hinglish. Whisper writes Hindi
 *      in Devanagari; the assistant answers in whatever script it sees, so
 *      that is fine.
 *   2. Gemini audio understanding: the same free key the rest of the AI
 *      uses; slower, used when Groq is out or the key is missing.
 *   Nothing is stored. The clip goes to the provider and is gone; only the
 *   text comes back.
 *
 * INPUT
 *   A data URL from the browser's MediaRecorder (audio/webm;codecs=opus on
 *   Chrome/Android, audio/mp4 on iPhone) - no multer, no temp files, same
 *   road the photo tools already take. Capped at 25 MB by Groq; we cap the
 *   clip at 60 seconds in the browser, which is well under 1 MB.
 */
const GROQ_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const { GEMINI_MODELS: GEMINI_API, GROQ_OPENAI } = require('./endpoints');
const { toHinglish } = require('./hinglish');

/**
 * Words the shop says that a generic model would mangle - a hint, not a
 * dictionary. Hindi and Hinglish both, on purpose: Whisper reads the prompt's
 * language as a clue to the clip's, and a short "hi, hello" from a phone once
 * came back as Icelandic ("Hæ, halló") with an English-only hint.
 */
const HINT = 'नमस्ते, मेरा ऑर्डर कहाँ है, पेमेंट कब आएगा, कूरियर बुक करो. ShopMaster Pro, Charming Jewels, Jaipur, jhumka, kada, mangalsutra, kundan, meenakari, oxidised, payout, courier, Shiprocket, Borzo, Razorpay, COD, order, return, dispute, refund.';

/** The languages this shop is actually spoken to in. Anything else is a misdetection. */
const EXPECTED = new Set(['hi', 'hindi', 'en', 'english', 'ur', 'urdu']);

const parseDataUrl = (dataUrl) => {
  const m = /^data:(audio\/[a-z0-9.+-]+)(?:;codecs=[^;]+)?;base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
};

const extFor = (mime) => ({ 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a' }[mime] || 'webm');

const viaGroq = async ({ mimeType, buffer }, { language }) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: 'GROQ_API_KEY is not set' };
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), `clip.${extFor(mimeType)}`);
  form.append('model', GROQ_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append('prompt', HINT);
  if (language && language !== 'auto') form.append('language', language);
  let res;
  try {
    res = await fetch(`${GROQ_OPENAI}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  } catch (err) {
    return { ok: false, reason: `Could not reach Groq: ${err.message}` };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || `Groq said ${res.status}` };
  const text = String(data.text || '').trim();
  if (!text) return { ok: false, reason: 'Nothing was heard' };
  return { ok: true, text, language: data.language || language || null, model: GROQ_MODEL, seconds: data.duration ? Math.round(data.duration) : null };
};

const viaGemini = async ({ mimeType, buffer }, { language }) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: 'GEMINI_API_KEY is not set' };
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const lang = language === 'hi' ? 'Hindi (Devanagari) or Hinglish, exactly as spoken' : 'the language spoken (Hindi in Devanagari, Hinglish, or English)';
  let res;
  try {
    res = await fetch(`${GEMINI_API}/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType, data: buffer.toString('base64') } }, { text: `Transcribe this audio verbatim in ${lang}. Output only the words spoken, no labels, no punctuation fixes beyond what is natural. Context words that may appear: ${HINT}.` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
    });
  } catch (err) {
    return { ok: false, reason: `Could not reach Gemini: ${err.message}` };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || `Gemini said ${res.status}` };
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) return { ok: false, reason: 'Nothing was heard' };
  return { ok: true, text, language: language || null, model, seconds: null };
};

/**
 * @param {string} dataUrl   data:audio/...;base64,...
 * @param {{language?: 'hi'|'hg'|'en'|'auto'}} [opts]  hg = heard as Hindi, written in roman letters
 * @returns {Promise<{ok:true,text:string,model:string,language:string|null,seconds:number|null}|{ok:false,reason:string}>}
 */
/*
 * The transcript gate (15 Sep 2026). Whisper-class models, given silence or
 * noise, do not say "nothing" - they say what they were trained on most:
 * "Thank you for watching", "Subscribe", a phrase looped four times, or a
 * language the shop never speaks. Those used to land in the search box or
 * the listing form as if the person had said them. Now they count as
 * "nothing heard": the other provider gets one try, then the person is
 * asked to speak again - never handed words they did not say.
 */
const HALLUCINATIONS = /^(thank(s| you)( for watching| so much)?\.?|thanks for watching\.?|subscribe( to (my|the) channel)?\.?|please subscribe\.?|bye\.?|you\.?|mbc ?뉴스.*|amara\.org.*|www\..*|\[.*\]|\(.*\)|आप देख रहे हैं.*|धन्यवाद\.?|सब्सक्राइब.*)$/i;
const looksLikeNoise = (text) => {
  const t = String(text || '').trim();
  if (t.length < 2) return 'nothing heard';
  if (HALLUCINATIONS.test(t)) return `only "${t.slice(0, 30)}" - a model filling silence`;
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 6) {
    const uniq = new Set(words).size;
    if (uniq / words.length < 0.34) return 'the same words looped';
  }
  const letters = (t.match(/[\p{L}]/gu) || []).length;
  if (letters / t.length < 0.4) return 'mostly not words';
  return null;
};

const transcribe = async (dataUrl, { language: wanted = 'auto' } = {}) => {
  const language = wanted === 'hg' ? 'hi' : wanted;
  const clip = parseDataUrl(dataUrl);
  if (!clip) return { ok: false, reason: 'That is not an audio clip' };
  if (clip.buffer.length < 2000) return { ok: false, reason: 'The clip is too short - hold the mic and speak' };
  if (clip.buffer.length > 8 * 1024 * 1024) return { ok: false, reason: 'The clip is too long - keep it under a minute' };

  let first = await viaGroq(clip, { language });
  // Auto-detect wandered off (Icelandic, Welsh, Nepali…) - a short clip does
  // that. Hindi is the shop's default; one more pass with it forced.
  if (first.ok && language === 'auto' && first.language && !EXPECTED.has(String(first.language).toLowerCase())) {
    const again = await viaGroq(clip, { language: 'hi' });
    if (again.ok) first = { ...again, redetected: first.language };
  }
  const finish = async (r) => (wanted === 'hg' ? { ...r, text: await toHinglish(r.text), script: 'roman' } : r);
  // The gate: a transcript that is not words is not a transcript.
  if (first.ok) {
    const noise = looksLikeNoise(first.text);
    if (!noise) return finish(first);
    console.warn(`transcribe: Groq heard ${noise} - asking Gemini once`);
    const second = await viaGemini(clip, { language });
    if (second.ok && !looksLikeNoise(second.text)) return finish({ ...second, fellBack: true });
    return { ok: false, reason: 'Nothing clear was heard - hold the mic a little longer and speak again', heard: first.text.slice(0, 60) };
  }
  if (/GROQ_API_KEY|429|quota|rate|reach|5\d\d/i.test(first.reason)) {
    const second = await viaGemini(clip, { language });
    if (second.ok) {
      if (looksLikeNoise(second.text)) return { ok: false, reason: 'Nothing clear was heard - hold the mic a little longer and speak again', heard: second.text.slice(0, 60) };
      console.warn(`transcribe: Groq unavailable (${first.reason.slice(0, 60)}) - Gemini heard it`);
      return finish({ ...second, fellBack: true });
    }
    return { ok: false, reason: `${first.reason}; fallback: ${second.reason}` };
  }
  return first;
};

module.exports = { transcribe, parseDataUrl, toHinglish, GROQ_MODEL, looksLikeNoise };
