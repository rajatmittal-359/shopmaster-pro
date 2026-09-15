/** The board photo, read once by the cheap model - a fact for the list, never a block (plan 2.40). */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const gemini = require('../utils/gemini');
const { readBoard } = require('../utils/boardRead');

const original = gemini.generate;
afterEach(() => { gemini.generate = original; });

describe('readBoard', () => {
  it('returns the board text, whether it is a shop, and whether the name agrees', async () => {
    gemini.generate = vi.fn(async () => ({ ok: true, text: '{"text":"MEERA JEWELS","isShop":true,"notes":"A jewellery shop front with a painted board."}' }));
    const r = await readBoard('https://res.cloudinary.com/x/shop.jpg', 'Meera Jewels');
    expect(r).toMatchObject({ ok: true, text: 'MEERA JEWELS', isShop: true, matches: true });
    const opts = gemini.generate.mock.calls[0][1];
    expect(opts.imageUrl).toContain('shop.jpg');
    expect(opts.model).toBe(gemini.LITE_MODEL);
  });
  it('a stock photo or a different board is said plainly; model trouble is a dash, not an error', async () => {
    gemini.generate = vi.fn(async () => ({ ok: true, text: '```json\n{"text":"","isShop":false}\n```' }));
    expect(await readBoard('https://x/y.jpg', 'Meera Jewels')).toMatchObject({ ok: true, text: '', isShop: false, matches: null });
    gemini.generate = vi.fn(async () => ({ ok: false, reason: 'quota' }));
    expect(await readBoard('https://x/y.jpg', 'Meera Jewels')).toMatchObject({ ok: false, reason: 'quota' });
    expect(await readBoard('', 'Meera Jewels')).toMatchObject({ ok: false });
  });
});
