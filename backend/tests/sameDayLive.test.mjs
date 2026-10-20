/**
 * "Same-day in Jaipur" on a share card must mean same-day can be bought (20 Oct 2026).
 *
 * Found filming the launch film: every live product's og:description read
 * "Same-day in Jaipur" while checkout offered "Same-day delivery, coming soon"
 * - the card read only the admin switch (shop.sameDayEnabled), not whether
 * Borzo is actually live. A link sent on WhatsApp promised what the shop
 * could not sell. The public settings now carry shop.sameDayLive: the switch
 * AND a production Borzo token, the same two things checkout needs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { publicView } = require('../controllers/settingsController.js');
const doc = (sameDayEnabled) => ({ business: {}, links: {}, shop: { sameDayEnabled }, home: {}, announcement: null, rules: { version: '1.3' } });

const saved = { token: process.env.BORZO_API_TOKEN, env: process.env.BORZO_ENV };
afterEach(() => {
  process.env.BORZO_API_TOKEN = saved.token;
  process.env.BORZO_ENV = saved.env;
  if (saved.token === undefined) delete process.env.BORZO_API_TOKEN;
  if (saved.env === undefined) delete process.env.BORZO_ENV;
});

describe('public settings: shop.sameDayLive', () => {
  it('is false while Borzo points at its simulator, even with the switch on', () => {
    process.env.BORZO_API_TOKEN = 'test-token';
    delete process.env.BORZO_ENV;
    expect(publicView(doc(true)).shop.sameDayLive).toBe(false);
  });

  it('is true with the switch on and Borzo in production', () => {
    process.env.BORZO_API_TOKEN = 'live-token';
    process.env.BORZO_ENV = 'production';
    expect(publicView(doc(true)).shop.sameDayLive).toBe(true);
  });

  it('is false when the admin has switched same-day off', () => {
    process.env.BORZO_API_TOKEN = 'live-token';
    process.env.BORZO_ENV = 'production';
    expect(publicView(doc(false)).shop.sameDayLive).toBe(false);
  });

  it('keeps every other shop setting as it was', () => {
    process.env.BORZO_API_TOKEN = 'live-token';
    process.env.BORZO_ENV = 'production';
    expect(publicView(doc(true)).shop.sameDayEnabled).toBe(true);
  });
});
