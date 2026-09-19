/**
 * Sarvam (plan 2.37d / 2.27): two HTTP calls, off without the key, and the
 * Hinglish chip asks saaras for roman transliteration so no second model runs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sarvam = require('../utils/ai/sarvam');

const clip = { buffer: Buffer.alloc(4000, 1), mimeType: 'audio/webm' };

describe('sarvam', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.SARVAM_API_KEY = 'sk_test';
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.SARVAM_API_KEY;
  });

  it('says plainly when the key is missing - nothing is called', async () => {
    delete process.env.SARVAM_API_KEY;
    global.fetch = vi.fn();
    expect(await sarvam.stt(clip, {})).toMatchObject({ ok: false, reason: /SARVAM_API_KEY/ });
    expect(await sarvam.tts('नमस्ते')).toMatchObject({ ok: false, reason: /SARVAM_API_KEY/ });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('stt sends the clip with the header, the model and the language; the Hinglish chip adds translit and marks the text roman', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ transcript: 'mera payment kab aayega', language_code: 'hi-IN' }) }));
    const r = await sarvam.stt(clip, { language: 'hg', hinglish: true });
    expect(r).toEqual({ ok: true, text: 'mera payment kab aayega', language: 'hi', model: 'saaras:v3', script: 'roman' });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.sarvam.ai/speech-to-text');
    expect(init.headers['api-subscription-key']).toBe('sk_test');
    const form = init.body;
    expect(form.get('model')).toBe('saaras:v3');
    expect(form.get('language_code')).toBe('hi-IN');
    expect(form.get('mode')).toBe('translit');
    expect(form.get('file').name).toBe('clip.webm');
  });

  it('stt with auto asks for "unknown" and no mode; a 4xx comes back as a reason with its status', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 402, json: async () => ({ error: { message: 'insufficient credits' } }) }));
    const r = await sarvam.stt(clip, { language: 'auto' });
    expect(r).toEqual({ ok: false, status: 402, reason: 'insufficient credits' });
    const form = global.fetch.mock.calls[0][1].body;
    expect(form.get('language_code')).toBe('unknown');
    expect(form.get('mode')).toBeNull();
  });

  it('tts posts bulbul with the Hindi voice and decodes the first audio', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ audios: [Buffer.from('ID3abc').toString('base64')] }) }));
    const r = await sarvam.tts('  नमस्ते,  दुकान  खुली है ', { lang: 'hi' });
    expect(r.ok).toBe(true);
    expect(r.mime).toBe('audio/mpeg');
    expect(r.audio.toString()).toBe('ID3abc');
    expect(r.characters).toBe('नमस्ते, दुकान खुली है'.length);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ language_code: 'hi-IN', speaker: 'ritu', model: 'bulbul:v3', output_audio_codec: 'mp3' });
  });

  it('tts refuses more than one call\'s worth rather than truncating a lesson', async () => {
    global.fetch = vi.fn();
    const r = await sarvam.tts('x'.repeat(2600));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/2500/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('transcribe with Sarvam as road 2', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.SARVAM_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  it('when Groq is rate-limited, Sarvam answers - and for the Hinglish chip its roman text is used as is', async () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.SARVAM_API_KEY = 's';
    const { transcribe } = require('../utils/ai/transcribe');
    const hinglish = require('../utils/ai/hinglish');
    const rewrite = vi.spyOn(hinglish, 'toHinglish');
    global.fetch = vi.fn(async (url) => {
      if (/groq/.test(String(url))) return { ok: false, status: 429, json: async () => ({ error: { message: 'rate limit reached' } }) };
      if (/sarvam/.test(String(url))) return { ok: true, json: async () => ({ transcript: 'oxidised silver ka kada, 1250 rupaye', language_code: 'hi-IN' }) };
      throw new Error(`unexpected ${url}`);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dataUrl = `data:audio/webm;base64,${Buffer.alloc(4000, 7).toString('base64')}`;
    const r = await transcribe(dataUrl, { language: 'hg' });
    expect(r).toMatchObject({ ok: true, text: 'oxidised silver ka kada, 1250 rupaye', model: 'saaras:v3', script: 'roman', fellBack: true });
    expect(rewrite).not.toHaveBeenCalled();
    expect(global.fetch.mock.calls.map(([u]) => String(u))).toEqual([expect.stringMatching(/groq/), expect.stringMatching(/sarvam/)]);
    warn.mockRestore();
    rewrite.mockRestore();
  });
});
