/**
 * "Bol ke listing" - the numbers out of a spoken sentence, with no model.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { byRegex, factsFromSpeech } = require('../utils/ai/speechListing');

describe('byRegex', () => {
  it('reads price, MRP, stock and size in Hinglish', () => {
    expect(byRegex('oxidised silver ka kada, 1250 rupaye, MRP 1800, 5 piece, free size')).toEqual({ mrp: 1800, price: 1250, stock: 5, size: 'Free Size' });
  });
  it('reads Devanagari numbers and units', () => {
    expect(byRegex('मीनाकारी झुमका, दाम 800 रुपये, दस नग')).toEqual({ price: 800, stock: 10 });
  });
  it('does not confuse the MRP with the stock, nor count a price twice', () => {
    expect(byRegex('cotton kurti size M price 699 mrp 999 quantity 12')).toEqual({ mrp: 999, price: 699, stock: 12, size: 'M' });
    expect(byRegex('₹2,499 ka set, 2 piece')).toEqual({ price: 2499, stock: 2 });
  });
});

describe('factsFromSpeech without any model', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  it('falls back to the regex and swaps a price above its MRP', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    const r = await factsFromSpeech('kada 1800 rupaye, mrp 1250, teen nag');
    expect(r.via).toBe('regex');
    expect(r.facts).toMatchObject({ price: 1250, mrp: 1800, stock: 3 });
  });
});
