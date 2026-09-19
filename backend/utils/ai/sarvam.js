/**
 * Sarvam AI - Indic speech, both directions (plan 2.37d / 2.27, 19 Sep 2026).
 *
 * WHY A FOURTH SPEECH COMPANY
 *   Whisper (Groq, Cloudflare) is trained on the world; Sarvam's saaras is
 *   trained on Indian speech and, with `mode: translit`, writes Hinglish in
 *   roman letters straight from the audio - the thing we otherwise pay a
 *   second model call for (hinglish.js). And bulbul is the first Hindi
 *   voice that does not sound like a railway announcement, which is what
 *   the Learn lessons need to be listened to by a shopkeeper who would
 *   rather not read.
 *
 * WHAT IT COSTS (docs.sarvam.ai/pricing, 19 Sep 2026)
 *   ₹100 of credits on sign-up, never expiring. STT ₹30/hour billed per
 *   second - a 6-second clip is half a paisa, so ~2,000 clips a day before
 *   the credits matter; TTS ₹30 per 10k characters - the six lessons in two
 *   languages are ~₹25, once. So: STT is a ROAD (after Groq's free 2,000 a
 *   day), TTS is a one-time SCRIPT whose files live on Cloudinary. Nothing
 *   here runs per answer.
 *
 * No SDK - two HTTP calls with Node's fetch, like gemini.js. Off entirely
 * until SARVAM_API_KEY is set; every function then says so rather than
 * throwing.
 */
const BASE = process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai';
const STT_MODEL = process.env.SARVAM_STT_MODEL || 'saaras:v3';
const TTS_MODEL = process.env.SARVAM_TTS_MODEL || 'bulbul:v3';
/** Voices chosen by ear from the bulbul:v3 list - warm, unhurried, Hindi-first. */
const SPEAKERS = { hi: process.env.SARVAM_VOICE_HI || 'ritu', en: process.env.SARVAM_VOICE_EN || 'shubh' };

const key = () => process.env.SARVAM_API_KEY || '';
const enabled = () => Boolean(key());

/** Our language chips → Sarvam's BCP-47 codes; 'auto' lets saaras decide. */
const LANG = { hi: 'hi-IN', hg: 'hi-IN', en: 'en-IN', auto: 'unknown' };

const extFor = (mime = '') => (/webm/.test(mime) ? 'webm' : /ogg/.test(mime) ? 'ogg' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : 'webm');

/**
 * Speech → text.
 * @param {{buffer:Buffer, mimeType:string}} clip
 * @param {{language?:'hi'|'hg'|'en'|'auto', hinglish?:boolean}} opts   hinglish → roman-script code-mixed transcript
 * @returns {Promise<{ok:true,text:string,language:string|null,model:string,script?:'roman'}|{ok:false,reason:string,status?:number}>}
 */
const stt = async ({ buffer, mimeType }, { language = 'auto', hinglish = false } = {}) => {
  if (!enabled()) return { ok: false, reason: 'SARVAM_API_KEY is not set' };
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'audio/webm' }), `clip.${extFor(mimeType)}`);
  form.append('model', STT_MODEL);
  form.append('language_code', LANG[language] || 'unknown');
  // translit: "मेरा पेमेंट कब आएगा" comes back as "Mera payment kab aayega" -
  // Hinglish in roman letters, no second model pass (checked live 19 Sep:
  // codemix keeps Devanagari for the Hindi words, translit romanises all).
  // saaras:v3 only.
  if (hinglish && /^saaras:v3/.test(STT_MODEL)) form.append('mode', 'translit');
  let res;
  try {
    res = await fetch(`${BASE}/speech-to-text`, { method: 'POST', headers: { 'api-subscription-key': key() }, body: form });
  } catch (err) {
    return { ok: false, reason: `Could not reach Sarvam: ${err.message}` };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || data?.message || `Sarvam said ${res.status}` };
  const text = String(data.transcript || '').trim();
  if (!text) return { ok: false, reason: 'Nothing was heard' };
  const lang = data.language_code ? String(data.language_code).split('-')[0] : null;
  const roman = hinglish && !/[ऀ-ॿ]/.test(text);
  return { ok: true, text, language: lang, model: STT_MODEL, ...(roman ? { script: 'roman' } : {}) };
};

/**
 * Text → speech, one call, one file.
 * @param {string} text        ≤ 2,500 characters (bulbul:v3)
 * @param {{lang?:'hi'|'en', speaker?:string, pace?:number, codec?:'mp3'|'wav'}} opts
 * @returns {Promise<{ok:true,audio:Buffer,mime:string,characters:number}|{ok:false,reason:string,status?:number}>}
 */
const tts = async (text, { lang = 'hi', speaker, pace = 0.95, codec = 'mp3' } = {}) => {
  if (!enabled()) return { ok: false, reason: 'SARVAM_API_KEY is not set' };
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, reason: 'Nothing to say' };
  if (clean.length > 2500) return { ok: false, reason: `Too long for one call (${clean.length} > 2500 characters) - split it` };
  const body = {
    text: clean,
    language_code: LANG[lang] || 'hi-IN',
    speaker: speaker || SPEAKERS[lang] || SPEAKERS.hi,
    model: TTS_MODEL,
    pace,
    speech_sample_rate: 22050,
    output_audio_codec: codec,
  };
  let res;
  try {
    res = await fetch(`${BASE}/text-to-speech`, { method: 'POST', headers: { 'api-subscription-key': key(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) {
    return { ok: false, reason: `Could not reach Sarvam: ${err.message}` };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || data?.message || `Sarvam said ${res.status}` };
  const b64 = Array.isArray(data.audios) ? data.audios[0] : null;
  if (!b64) return { ok: false, reason: 'Sarvam returned no audio' };
  return { ok: true, audio: Buffer.from(b64, 'base64'), mime: codec === 'wav' ? 'audio/wav' : 'audio/mpeg', characters: clean.length };
};

module.exports = { stt, tts, enabled, STT_MODEL, TTS_MODEL, SPEAKERS, LANG };
