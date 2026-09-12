/**
 * The listing writer must not die with Gemini's daily quota.
 *
 * On 12 Sep 2026 Gemini answered 429 for the rest of the day after a script
 * run, and every seller's "Write it for me" would have failed with it - a
 * promised feature that does not work is worse than one never offered.
 * Pollinations' gpt-5.4-nano reads a photo, answers in JSON and costs about
 * 0.0001 Pollen a call (measured: 0.40176 -> 0.40164 for one image call), so
 * it is the second road: taken only when Gemini refuses on quota or is not
 * configured, and named in the answer so the caller can say which model
 * wrote the draft.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GEMINI_API_KEY;
  delete process.env.POLLINATIONS_API_KEY;
});
beforeEach(() => {
  process.env.GEMINI_API_KEY = 'g';
  process.env.POLLINATIONS_API_KEY = 'p';
});

const jsonResponse = (status, body) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('pollinationsText', () => {
  it('asks the OpenAI-compatible endpoint for JSON, with the photo when given', async () => {
    const { pollinationsText } = require('../utils/ai/textFallback');
    let sent;
    globalThis.fetch = vi.fn(async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return jsonResponse(200, { choices: [{ message: { content: '{"ok":true}' } }] });
    });
    const out = await pollinationsText('Describe it', { imageUrl: 'https://img/x.jpg', json: true });
    expect(out).toEqual({ ok: true, text: '{"ok":true}', provider: 'pollinations', model: 'gpt-5.4-nano' });
    expect(sent.url).toContain('gen.pollinations.ai/v1/chat/completions');
    expect(sent.body.response_format).toEqual({ type: 'json_object' });
    const content = sent.body.messages[0].content;
    expect(content.some((c) => c.type === 'image_url' && c.image_url.url === 'https://img/x.jpg')).toBe(true);
  });
});

describe('generate falls back', () => {
  it('goes to Pollinations when Gemini says 429 for the day', async () => {
    const { generate } = require('../utils/gemini');
    const calls = [];
    globalThis.fetch = vi.fn(async (url) => {
      calls.push(String(url));
      if (String(url).includes('generativelanguage')) return jsonResponse(429, { error: { message: 'quota' } });
      return jsonResponse(200, { choices: [{ message: { content: '{"name":"Kundan choker"}' } }] });
    });
    const out = await generate('Write it', { responseSchema: { type: 'object' }, attempts: 1 });
    expect(out.ok).toBe(true);
    expect(out.provider).toBe('pollinations');
    expect(out.text).toContain('Kundan');
    expect(calls.some((u) => u.includes('pollinations'))).toBe(true);
  });

  it('does not fall back on a refusal that is not about quota', async () => {
    const { generate } = require('../utils/gemini');
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { error: { message: 'bad request' } }));
    const out = await generate('Write it', { attempts: 1 });
    expect(out.ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
