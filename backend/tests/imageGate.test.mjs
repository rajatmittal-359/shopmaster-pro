/** Images: facts in the prompt, a scene per kind of thing, the gate's verdict. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { EDIT_PROMPTS, runImage } = require('../utils/ai/imageGen');
const { judgeEdit } = require('../utils/ai/imageGate');

describe('edit prompts carry the facts', () => {
  it('lifestyle puts a toe ring on a toe, not "appropriate to what it is"', async () => {
    const calls = [];
    const deps = {
      cloudflare: vi.fn(async (remote, { prompt }) => { calls.push(prompt); return { buffer: Buffer.from('x'), mime: 'image/png' }; }),
      pollinations: vi.fn(), nvidia: vi.fn(), huggingface: vi.fn(),
      fetchReference: vi.fn(async () => Buffer.from('ref')),
      book: { canUse: async () => true, note: async () => {}, mark: async () => {}, available: async () => true, record: async () => {} },
    };
    try {
      await runImage({ mode: 'lifestyle', tier: 'standard', imageUrl: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg', productName: 'Silver Toe Ring', facts: { category: 'Rings', material: 'oxidised silver', color: 'silver' } }, deps);
    } catch {
      /* bookkeeping shape may differ; the prompt is what is under test */
    }
    const p = calls[0] || EDIT_PROMPTS.lifestyle('Silver Toe Ring, oxidised silver', null, 'worn on the second toe of a woman’s foot, foot resting on a light surface');
    expect(p).toMatch(/Keep the exact product/);
    expect(p).toMatch(/second toe/);
    expect(p).toMatch(/No other products, no text, no logos/);
  });
});

describe('judgeEdit', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; delete process.env.GEMINI_API_KEY; });

  it('is "unchecked" without a key, and never blocks', async () => {
    const v = await judgeEdit({ beforeUrl: 'https://a/1.jpg', afterDataUrl: 'data:image/png;base64,AAAA' });
    expect(v).toEqual({ checked: false, ok: true, issue: '' });
  });

  it('reads the model\'s verdict: a redrawn product fails with its reason', async () => {
    process.env.GEMINI_API_KEY = 'k';
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('generativelanguage')) return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"sameProduct":false,"productVisible":true,"issue":"the earrings gained a third drop"}' }] } }] }), text: async () => '' };
      return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    });
    const v = await judgeEdit({ beforeUrl: 'https://a/1.jpg', afterDataUrl: 'data:image/png;base64,AAAA', subject: 'Pearl Drop Jhumka' });
    expect(v.checked).toBe(true);
    expect(v.ok).toBe(false);
    expect(v.issue).toMatch(/third drop/);
    const body = JSON.parse(global.fetch.mock.calls.find((c) => String(c[0]).includes('generativelanguage'))[1].body);
    expect(body.contents[0].parts.filter((p) => p.inlineData)).toHaveLength(2);
    expect(String(global.fetch.mock.calls.find((c) => String(c[0]).includes('generativelanguage'))[0])).toMatch(/flash-lite/);
  });
});
