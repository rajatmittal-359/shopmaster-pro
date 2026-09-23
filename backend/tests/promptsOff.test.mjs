/**
 * "Not now", remembered on the account (24 Sep 2026).
 *
 * Rajat, on his phone: "kae baar not now kar diya, everytime i open fir se
 * dikh jata hai". The refusal was a seven-day note in localStorage, which is
 * empty again whenever the panel is opened from inside another app, in a
 * private tab, or on a second phone - so the shop kept being asked something
 * it had already answered. The answer belongs to the seller, not the browser.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Seller = require('../models/Seller');
const { dismissPrompt, getSettings } = require('../controllers/sellerController');
const { chainableQuery } = require('./helpers/testDouble.mjs');

const USER = '6a93cf88fbb4f39f4a6d5618';

const call = async (handler, body = {}) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ body, user: { _id: USER } }, res, () => {});
  return res;
};

describe('a nudge the seller has waved away', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is written to the account, not left to the browser', async () => {
    let update = null;
    vi.spyOn(Seller, 'findOneAndUpdate').mockImplementation((filter, u) => {
      update = u;
      return chainableQuery({ promptsOff: ['push'] });
    });
    const res = await call(dismissPrompt, { key: 'push' });
    expect(res.code).toBe(200);
    expect(res.body.promptsOff).toEqual(['push']);
    // $addToSet, so answering twice does not write the same word twice.
    expect(update).toEqual({ $addToSet: { promptsOff: 'push' } });
  });

  it(`comes back with the seller's settings, which is where the panel reads it`, async () => {
    vi.spyOn(Seller, 'findOne').mockResolvedValue({ businessName: 'Charming Jewels', promptsOff: ['push'], agreement: {} });
    const res = await call(getSettings);
    expect(res.body.settings.promptsOff).toEqual(['push']);
  });

  it('only takes keys the API knows - the panel cannot invent state to store', async () => {
    const res = await call(dismissPrompt, { key: 'anything-else' });
    expect(res.code).toBe(400);
  });

  it('says so plainly when there is no shop behind the login', async () => {
    vi.spyOn(Seller, 'findOneAndUpdate').mockImplementation(() => chainableQuery(null));
    const res = await call(dismissPrompt, { key: 'push' });
    expect(res.code).toBe(404);
  });
});
