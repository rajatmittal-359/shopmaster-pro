/**
 * "Market check" (21 Sep 2026, Rajat: "rate recommend karde aur shabd bhi
 * trending and SEO ke hisaab se"). One grounded search per product title,
 * cached a day; the answer is a price band with the sites it came from and
 * the words buyers type - advice, never an automatic change.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseMarketCheck, marketPrompt } = require('../utils/ai/marketCheck');

describe('parseMarketCheck', () => {
  it('keeps a sane band, sources and words; drops junk', () => {
    const out = parseMarketCheck({
      low: '899', high: 1499, typical: 1199,
      sources: ['Amazon', 'flipkart', 'Meesho', 'Amazon', 'x'.repeat(80)],
      words: ['ad necklace set', 'AD Necklace Set', 'american diamond bridal set', '', 'kundan choker'],
      note: 'Most listings sit between 899 and 1499 on Amazon and Flipkart.',
    }, 1250);
    expect(out.band).toEqual({ low: 899, high: 1499, typical: 1199 });
    expect(out.sources).toEqual(['Amazon', 'flipkart', 'Meesho']);
    expect(out.words).toEqual(['ad necklace set', 'american diamond bridal set', 'kundan choker']);
    expect(out.position).toBe('inside');
  });
  it('says where the seller price sits against the band', () => {
    expect(parseMarketCheck({ low: 500, high: 900 }, 1250).position).toBe('above');
    expect(parseMarketCheck({ low: 1500, high: 2500 }, 1250).position).toBe('below');
    expect(parseMarketCheck({ low: 0, high: 0 }, 1250).band).toBeNull();
  });
  it('the prompt names the product and asks for Indian marketplaces only', () => {
    const p = marketPrompt({ name: 'AD necklace set', categoryName: 'Necklace Sets', material: 'brass' });
    expect(p).toMatch(/AD necklace set/);
    expect(p).toMatch(/Amazon\.in|Flipkart|Meesho|Myntra/);
    expect(p).toMatch(/INR|₹/);
  });
});
