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
