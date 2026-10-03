/**
 * A seller may publish their Justdial listing (3 Oct 2026).
 *
 * WHY THIS FIELD AND NOT ANOTHER
 *   `links` exists for one job: Google reads every value as schema.org
 *   `sameAs` on the shop page, which is the claim "this website and that
 *   listing are one business". The five fields a seller had - Instagram,
 *   Facebook, YouTube, Google Business, website - are the global ones.
 *   Justdial is where a small Indian shop is most likely to ALREADY have a
 *   listing it never made itself, and the platform's own settings have had a
 *   Justdial field all along. The seller side simply never got one.
 *
 *   Found on 3 Oct while clearing Charming Jewels' three profile links off the
 *   PLATFORM's schema, where they had been claiming the marketplace and the
 *   jewellery shop were one entity. Two of the three had a home to move to on
 *   the seller side. The Justdial one did not.
 *
 * WHAT IS BEING DEFENDED
 *   1. The host check. `links` is published, so a field that accepts any URL
 *      is a field that publishes somebody else's site under this shop's name.
 *      Every other key is matched against its own hostname; this one must be
 *      too, or it is the one hole in the row.
 *   2. The journey end to end. A link that saves but never reaches `sameAs`
 *      is worth nothing - the whole point is the schema on the shop page, and
 *      that is built by a different file from the one that stores it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { buildShopSchema } from '../../web/src/lib/shopSchema.js';

const require = createRequire(import.meta.url);
const { applyShopSettings } = require('../controllers/sellerController');
const moderate = require('../utils/ai/moderate');

const LISTING =
  'https://www.justdial.com/Jaipur/Charming-Jewels-Near-Gurjer-Ki-Thadi-Devi-Nagar/0141PX141-X141-231228124253-Y1D4_BZDET';

const shop = (over = {}) => ({
  _id: 's1',
  userId: 'u1',
  businessName: 'Charming Jewels',
  about: '',
  links: { instagram: '', facebook: '', youtube: '', googleBusiness: '', website: '', justdial: '' },
  showLocation: false,
  offersFreeShipping: false,
  pickupAddress: { contactName: 'A', address1: '1 Lane', city: 'Jaipur', state: 'Rajasthan', pincode: '302019', phone: '9876500001' },
  adminEdits: [],
  save: vi.fn(async function save() { return this; }),
  ...over,
});

describe('the Justdial link a seller can publish', () => {
  const originalModerate = moderate.moderateText;
  beforeEach(() => { moderate.moderateText = vi.fn(async () => ({ flagged: false, categories: [] })); });
  afterEach(() => { moderate.moderateText = originalModerate; });

  it('is stored, normalised and named among the changes', async () => {
    const s = shop();
    const r = await applyShopSettings(s, { links: { justdial: LISTING } });

    expect(r.error).toBeUndefined();
    expect(r.changed).toEqual(['justdial link']);
    expect(s.links.justdial).toBe(LISTING);
  });

  it('accepts the bare host the way the other fields do', async () => {
    const s = shop();
    await applyShopSettings(s, { links: { justdial: 'justdial.com/Jaipur/Charming-Jewels' } });
    expect(s.links.justdial).toBe('https://justdial.com/Jaipur/Charming-Jewels');
  });

  it('refuses a link that is not Justdial, and says which field', async () => {
    const r = await applyShopSettings(shop(), { links: { justdial: 'https://www.sulekha.com/x' } });
    expect(r.error).toMatch(/justdial/i);
  });

  it('empties cleanly, and an empty one is not a change', async () => {
    const s = shop({ links: { instagram: '', facebook: '', youtube: '', googleBusiness: '', website: '', justdial: LISTING } });
    expect((await applyShopSettings(s, { links: { justdial: '' } })).changed).toEqual(['justdial link']);
    expect(s.links.justdial).toBe('');
    expect((await applyShopSettings(s, { links: { justdial: '' } })).changed).toEqual([]);
  });

  it('reaches the shop page as sameAs, which is the whole point', async () => {
    const schema = buildShopSchema(
      { slug: 'charming-jewels', businessName: 'Charming Jewels', links: { justdial: LISTING } },
      'https://www.shopmasterpro.in'
    );
    expect(schema.sameAs).toContain(LISTING);
  });
});
