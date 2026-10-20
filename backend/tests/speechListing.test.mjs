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

  /*
   * The order shopkeepers actually speak in (20 Oct 2026): "650 rupaye, 10
   * piece" read "rupaye 10" as a second price, so the fallback saved price ₹10
   * and MRP ₹650. A number followed by a count word is the count.
   */
  it('reads "650 rupaye 10 piece" as price 650 and stock 10, not price 10', () => {
    expect(byRegex('kada 650 rupaye 10 piece')).toEqual({ price: 650, stock: 10 });
    expect(byRegex('chaar ki jodi 300 rupaye 6 nag')).toEqual({ price: 300, stock: 6 });
    expect(byRegex('oxidised chudiyan, 4 ka set, 650 rupaye')).toEqual({ price: 650 });
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

/*
 * "Set of four" is the pack, not the stock (20 Oct 2026, found filming the
 * launch film): "Oxidised bangles, set of four, 650 rupees" came back as
 * stock 4 - the model read the set size as pieces in hand. A seller who never
 * said a count must get an empty stock box to fill, not a wrong number.
 */
describe('factsFromSpeech: a set size is not stock', () => {
  const realFetch = global.fetch;
  const realKey = process.env.GROQ_API_KEY;
  afterEach(() => {
    global.fetch = realFetch;
    if (realKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = realKey;
  });
  const modelSays = (facts) => {
    process.env.GROQ_API_KEY = 'test';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(facts) } }] }) }));
  };

  it('drops a stock the model took from "set of four" when no count was said', async () => {
    modelSays({ name: 'Oxidised bangles', price: 650, stock: 4 });
    const r = await factsFromSpeech('Oxidised bangles, set of 4, 650 rupees.');
    expect(r.facts.price).toBe(650);
    expect(r.facts.stock).toBe(null);
  });

  it('drops it for "chaar ka set" too', async () => {
    modelSays({ name: 'Oxidised chudiyan', price: 650, stock: 4 });
    const r = await factsFromSpeech('oxidised chudiyan, 4 ka set, 650 rupaye');
    expect(r.facts.stock).toBe(null);
  });

  it('keeps a count that was said, next to a set size', async () => {
    modelSays({ name: 'Oxidised bangles', price: 650, stock: 10 });
    const r = await factsFromSpeech('Oxidised bangles, set of 4, 650 rupees, 10 pieces');
    expect(r.facts.stock).toBe(10);
  });
});
