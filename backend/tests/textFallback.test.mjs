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
  // 15 Sep 2026: "jo AI khatam ho jaaye, dusre uski jagah kaam karein" - Groq sits before Pollinations.
  it('goes to Groq before Pollinations when Gemini (flash and lite) is out, and unwraps fenced JSON', async () => {
    const { generate } = require('../utils/gemini');
    process.env.GROQ_API_KEY = 'g';
    const urls = [];
    globalThis.fetch = vi.fn(async (url) => {
      urls.push(String(url));
      if (String(url).includes('generativelanguage')) return jsonResponse(429, { error: { message: 'quota' } });
      if (String(url).includes('groq')) return { ...jsonResponse(200, { choices: [{ message: { content: '```json\n{"name":"from groq"}\n```' } }] }), headers: { get: () => null } };
      return jsonResponse(200, { choices: [{ message: { content: '{"name":"from nano"}' } }] });
    });
    try {
      const out = await generate('Write it', { responseSchema: { type: 'object' }, attempts: 1 });
      expect(out.ok).toBe(true);
      expect(out.provider).toBe('groq');
      expect(JSON.parse(out.text).name).toBe('from groq');
      expect(urls.some((u) => u.includes('pollinations'))).toBe(false);
    } finally {
      delete process.env.GROQ_API_KEY;
    }
  });

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

describe('the chip names the road', () => {
  it("'nano' goes straight to Pollinations without asking Gemini", async () => {
    const { generate } = require('../utils/gemini');
    const calls = [];
    globalThis.fetch = vi.fn(async (url) => {
      calls.push(String(url));
      return jsonResponse(200, { choices: [{ message: { content: 'hi' } }] });
    });
    const out = await generate('Write it', { textModel: 'nano' });
    expect(out.provider).toBe('pollinations');
    expect(calls.every((u) => u.includes('pollinations'))).toBe(true);
  });

  it("'gemini' never leaves Google, even on quota (flash, then lite, never Pollinations)", async () => {
    const { generate } = require('../utils/gemini');
    const urls = [];
    globalThis.fetch = vi.fn(async (url) => { urls.push(String(url)); return jsonResponse(429, { error: { message: 'quota' } }); });
    const out = await generate('Write it', { textModel: 'gemini', attempts: 1 });
    expect(out.ok).toBe(false);
    expect(urls.every((u) => u.includes('generativelanguage'))).toBe(true);
    expect(urls.some((u) => u.includes('flash-lite'))).toBe(true);
  });

  // 15 Sep 2026: flash said 429 all day ("limit: 20"); lite answered in under a second.
  it('tries flash-lite on a 429 before any other provider, and keeps its answer', async () => {
    const { generate } = require('../utils/gemini');
    const urls = [];
    globalThis.fetch = vi.fn(async (url) => {
      urls.push(String(url));
      if (String(url).includes('flash-lite')) return jsonResponse(200, { candidates: [{ content: { parts: [{ text: '{"name":"from lite"}' }] } }] });
      if (String(url).includes('generativelanguage')) return jsonResponse(429, { error: { message: 'quota' } });
      return jsonResponse(200, { choices: [{ message: { content: '{"name":"from nano"}' } }] });
    });
    const out = await generate('Write it', { responseSchema: { type: 'object' }, attempts: 1 });
    expect(out.ok).toBe(true);
    expect(out.text).toContain('from lite');
    expect(out.model).toMatch(/flash-lite/);
    expect(urls.some((u) => u.includes('pollinations'))).toBe(false);
  });
});

/*
 * 14 Oct 2026. The seller form went dead for a day and the reason was not
 * quota: `gemini-3.5-flash` answered 503 "experiencing high demand" for hours
 * while `flash-lite` served every request in under a second. The code could
 * not reach it - leaving Google and trying lite were BOTH gated on 429 alone,
 * so a 503 was retried four times and then given up on.
 *
 * A 503 is the one failure another model is most likely to answer: it is that
 * model's load, not our prompt. A 4xx still fails fast, because a second
 * provider would refuse the same bad request.
 */
describe('a busy model is not a dead end', () => {
  /*
   * utils/gemini remembers a 429 for ten minutes in module state, and the 429
   * tests above set it. Without a fresh copy these tests would start at
   * flash-lite and pass without ever walking the 503 road they exist to prove.
   */
  beforeEach(() => {
    delete require.cache[require.resolve('../utils/gemini')];
  });

  it('asks flash first, then flash-lite, when flash says 503', async () => {
    const { generate } = require('../utils/gemini');
    const urls = [];
    globalThis.fetch = vi.fn(async (url) => {
      urls.push(String(url));
      if (String(url).includes('flash-lite')) return jsonResponse(200, { candidates: [{ content: { parts: [{ text: '{"name":"from lite"}' }] } }] });
      return jsonResponse(503, { error: { status: 'UNAVAILABLE', message: 'high demand' } });
    });
    const out = await generate('Write it', { responseSchema: { type: 'object' }, attempts: 1 });
    expect(out.ok).toBe(true);
    expect(out.text).toContain('from lite');
    expect(out.model).toMatch(/flash-lite/);
    // The order matters: a pass must mean the 503 road was walked, not that an
    // earlier test in this file left flash marked out of quota.
    expect(urls[0]).not.toMatch(/flash-lite/);
    expect(urls[1]).toMatch(/flash-lite/);
  });

  it('goes on to the next provider when both Gemini models say 503', async () => {
    const { generate } = require('../utils/gemini');
    process.env.GROQ_API_KEY = 'g';
    const urls = [];
    globalThis.fetch = vi.fn(async (url) => {
      urls.push(String(url));
      if (String(url).includes('generativelanguage')) return jsonResponse(503, { error: { status: 'UNAVAILABLE', message: 'high demand' } });
      return { ...jsonResponse(200, { choices: [{ message: { content: '{"name":"from groq"}' } }] }), headers: { get: () => null } };
    });
    try {
      const out = await generate('Write it', { responseSchema: { type: 'object' }, attempts: 1 });
      expect(out.ok).toBe(true);
      expect(out.provider).toBe('groq');
    } finally {
      delete process.env.GROQ_API_KEY;
    }
  });

  it('still fails fast on a 400 - a second provider would refuse it too', async () => {
    const { generate } = require('../utils/gemini');
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { error: { message: 'bad request' } }));
    const out = await generate('Write it', { attempts: 1 });
    expect(out.ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

/*
 * The same day, the last road was lying. Pollinations' Pollen ran out and the
 * endpoint kept answering 200 - with the billing notice as the message
 * content. `response.ok` was true and the text was not empty, so it was
 * handed back as a finished product description. A caller wanting JSON then
 * failed to parse it and showed the seller "fail"; a caller wanting prose
 * would have printed "top up your account" onto a product page.
 */
describe('an out-of-credits answer is a failure, not a draft', () => {
  const BILLING = "The account behind this API key doesn't have enough credits. Please [top up](https://enter.pollinations.ai/top-up) or complete a quest, then try again.";

  it('refuses the billing notice instead of returning it as text', async () => {
    const { pollinationsText } = require('../utils/ai/textFallback');
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { choices: [{ message: { content: BILLING } }] }));
    const out = await pollinationsText('Describe it');
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/credit/i);
  });

  it('still returns a real draft that happens to mention credit', async () => {
    const { pollinationsText } = require('../utils/ai/textFallback');
    const draft = 'A credit-card sized pendant box, gift wrapped, ships across India.';
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { choices: [{ message: { content: draft } }] }));
    const out = await pollinationsText('Describe it');
    expect(out.ok).toBe(true);
    expect(out.text).toBe(draft);
  });
});
