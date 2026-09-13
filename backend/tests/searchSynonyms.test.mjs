/**
 * Hinglish and Hindi search words widen to the English the listings use.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { expandQuery } = require('../utils/searchSynonyms');

describe('expandQuery', () => {
  it('keeps the original words first and adds the English', () => {
    const q = expandQuery('lal jhumka');
    expect(q.startsWith('lal jhumka ')).toBe(true);
    expect(q).toMatch(/\bred\b/);
    expect(q).toMatch(/\bearrings\b/);
  });
  it('reads Devanagari and two-word phrases', () => {
    expect(expandQuery('झुमका')).toMatch(/earring/);
    expect(expandQuery('maang tikka')).toMatch(/matha patti|head jewellery/);
  });
  it('leaves an English query it does not know alone', () => {
    expect(expandQuery('bluetooth speaker')).toBe('bluetooth speaker');
  });
});
