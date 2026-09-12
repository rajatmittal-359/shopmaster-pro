/**
 * A suspended seller's products leave the storefront the same minute.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const hidden = require('../utils/hiddenSellers');

describe('hiddenSellerIds', () => {
  it('returns the suspended sellers user ids and remembers them', async () => {
    hidden.forget();
    let calls = 0;
    const find = async () => { calls++; return [{ userId: 'u1' }, { userId: 'u2' }]; };
    expect(await hidden.hiddenSellerIds({ find })).toEqual(['u1', 'u2']);
    expect(await hidden.hiddenSellerIds({ find })).toEqual(['u1', 'u2']);
    expect(calls).toBe(1);
    hidden.forget();
  });

  it('keeps the last answer when the lookup fails - never empties the shop', async () => {
    hidden.forget();
    await hidden.hiddenSellerIds({ find: async () => [{ userId: 'u9' }] });
    hidden.forget();
    const ids = await hidden.hiddenSellerIds({ find: async () => { throw new Error('db'); } });
    expect(ids).toEqual([]);
    hidden.forget();
  });
});

describe('withoutHiddenSellers', () => {
  it('adds $nin only when somebody is suspended', async () => {
    hidden.forget();
    expect(await hidden.withoutHiddenSellers({ isActive: true }, { find: async () => [] })).toEqual({ isActive: true });
    hidden.forget();
    expect(await hidden.withoutHiddenSellers({ isActive: true }, { find: async () => [{ userId: 'u1' }] })).toEqual({ isActive: true, sellerId: { $nin: ['u1'] } });
    hidden.forget();
  });
});
