/**
 * Awaaz → text: the walls and the roads, with no provider on the line.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { transcribe, parseDataUrl } = require('../utils/ai/transcribe');

const clip = (bytes = 5000, mime = 'audio/webm;codecs=opus') => `data:${mime};base64,${Buffer.alloc(bytes, 1).toString('base64')}`;

describe('parseDataUrl', () => {
  it('reads the mime and the bytes, codecs suffix included', () => {
    const p = parseDataUrl(clip(10));
    expect(p.mimeType).toBe('audio/webm');
    expect(p.buffer.length).toBe(10);
  });
  it('refuses anything that is not audio', () => {
    expect(parseDataUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(parseDataUrl('hello')).toBeNull();
  });
});

describe('transcribe', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('rejects too short and too long before any network call', async () => {
    global.fetch = vi.fn();
    expect((await transcribe(clip(100))).reason).toMatch(/too short/);
    expect((await transcribe(clip(9 * 1024 * 1024))).reason).toMatch(/too long/);
    expect((await transcribe('data:text/plain;base64,QUFB')).reason).toMatch(/not an audio/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('goes to Groq as multipart with the language when given', async () => {
    process.env.GROQ_API_KEY = 'g';
    let seen;
    global.fetch = vi.fn(async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ text: ' मेरा पेआउट कब आएगा ', language: 'hi', duration: 4.2 }) };
    });
    const r = await transcribe(clip(), { language: 'hi' });
    expect(r).toMatchObject({ ok: true, text: 'मेरा पेआउट कब आएगा', language: 'hi', seconds: 4 });
    expect(seen.url).toContain('api.groq.com/openai/v1/audio/transcriptions');
    expect(seen.init.headers.Authorization).toBe('Bearer g');
    expect(seen.init.body).toBeInstanceOf(FormData);
    expect(seen.init.body.get('language')).toBe('hi');
    expect(seen.init.body.get('model')).toMatch(/whisper/);
    expect(seen.init.body.get('file').name).toBe('clip.webm');
  });

  it('falls to Gemini when Groq is missing or out of quota, and says so', async () => {
    process.env.GEMINI_API_KEY = 'x';
    global.fetch = vi.fn(async (url) => {
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'order kahan hai' }] } }] }) };
      return { ok: false, status: 429, json: async () => ({ error: { message: 'rate limit' } }) };
    });
    const noKey = await transcribe(clip());
    expect(noKey).toMatchObject({ ok: true, text: 'order kahan hai', fellBack: true });

    process.env.GROQ_API_KEY = 'g';
    const quota = await transcribe(clip());
    expect(quota).toMatchObject({ ok: true, fellBack: true });
    expect(global.fetch.mock.calls.some(([u]) => u.includes('groq'))).toBe(true);
  });

  it('a 400 from Groq is ours - no fallback, the reason comes back', async () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.GEMINI_API_KEY = 'x';
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'unsupported file' } }) }));
    const r = await transcribe(clip());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unsupported file');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('language misdetection', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  });

  it('a clip heard as Icelandic is heard again as Hindi', async () => {
    process.env.GROQ_API_KEY = 'g';
    const langs = [];
    global.fetch = vi.fn(async (url, init) => {
      langs.push(init.body.get('language'));
      const forced = init.body.get('language') === 'hi';
      return { ok: true, json: async () => (forced ? { text: 'हाय हेलो', language: 'hi' } : { text: 'Hæ, halló', language: 'Icelandic' }) };
    });
    const r = await transcribe(clip(), { language: 'auto' });
    expect(langs).toEqual([null, 'hi']);
    expect(r.text).toBe('हाय हेलो');
    expect(r.redetected).toBe('Icelandic');
  });

  it('English and Hindi detections are trusted first time', async () => {
    process.env.GROQ_API_KEY = 'g';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ text: 'where is my order', language: 'English' }) }));
    const r = await transcribe(clip(), { language: 'auto' });
    expect(r.text).toBe('where is my order');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('Hinglish mode', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  });

  it('hears as Hindi, then writes in roman letters', async () => {
    process.env.GROQ_API_KEY = 'g';
    const calls = [];
    global.fetch = vi.fn(async (url, init) => {
      calls.push(url);
      if (url.includes('/audio/')) {
        expect(init.body.get('language')).toBe('hi');
        return { ok: true, json: async () => ({ text: 'मेरा पेमेंट कब आएगा', language: 'hi' }) };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'mera payment kab aayega' } }] }) };
    });
    const r = await transcribe(clip(), { language: 'hg' });
    expect(r.text).toBe('mera payment kab aayega');
    expect(r.script).toBe('roman');
    expect(calls.some((u) => u.includes('chat/completions'))).toBe(true);
  });

  it('roman text is left alone; Devanagari stands when no model can help', async () => {
    const { toHinglish } = require('../utils/ai/transcribe');
    global.fetch = vi.fn();
    expect(await toHinglish('where is my order')).toBe('where is my order');
    expect(await toHinglish('मेरा ऑर्डर')).toBe('मेरा ऑर्डर');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('looksLikeNoise - the transcript gate (15 Sep 2026)', () => {
  const { looksLikeNoise } = require('../utils/ai/transcribe');
  it('passes real speech in three scripts', () => {
    for (const t of ['paanch chandi ke jhumke chaar sau rupaye', 'पाँच चाँदी के झुमके, चार सौ रुपये', 'Five silver jhumkas at four hundred rupees', 'Ok']) expect(looksLikeNoise(t), t).toBeNull();
  });
  it('catches the classic silence fillers, loops and non-words', () => {
    expect(looksLikeNoise('Thank you for watching.')).toMatch(/filling silence/);
    expect(looksLikeNoise('Subscribe to my channel')).toMatch(/filling silence/);
    expect(looksLikeNoise('धन्यवाद')).toMatch(/filling silence/);
    expect(looksLikeNoise('jhumka jhumka jhumka jhumka jhumka jhumka jhumka')).toMatch(/looped/);
    expect(looksLikeNoise('... --- ... 123 456')).toMatch(/not words/);
    expect(looksLikeNoise('')).toMatch(/nothing/);
  });
});
