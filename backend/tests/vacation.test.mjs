/**
 * A shop on a break (19 Sep 2026): the switch expires by itself, the dates
 * are checked, checkout says who is away and until when, the product page
 * keeps answering with the note while the lists drop the shop.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Seller = require('../models/Seller');
const vacation = require('../utils/vacation');
const hidden = require('../utils/hiddenSellers');
const { applyShopSettings } = require('../controllers/sellerController');

const NOW = new Date('2026-11-05T06:00:00Z');
const chain = (r) => ({ select: () => chain(r), lean: () => Promise.resolve(r), then: (a, b) => Promise.resolve(r).then(a, b) });

afterEach(() => {
  vi.restoreAllMocks();
  hidden.forget();
});

describe('onBreak / breakOf', () => {
  it('on with no date stays on; the until day itself counts; the day after it is over', () => {
    expect(vacation.onBreak({ vacation: { on: true, until: null } }, NOW)).toBe(true);
    expect(vacation.onBreak({ vacation: { on: true, until: new Date('2026-11-05T00:00:00Z') } }, NOW)).toBe(true);
    expect(vacation.onBreak({ vacation: { on: true, until: new Date('2026-11-03T00:00:00Z') } }, NOW)).toBe(false);
    expect(vacation.onBreak({ vacation: { on: false, until: new Date('2026-12-01') } }, NOW)).toBe(false);
    expect(vacation.onBreak({}, NOW)).toBe(false);
    expect(vacation.breakOf({ vacation: { on: true, until: new Date('2026-11-12T00:00:00Z'), note: 'Back after Diwali' } }, NOW)).toEqual({ until: new Date('2026-11-12T00:00:00Z'), untilText: '12 Nov', note: 'Back after Diwali' });
    expect(vacation.breakOf({ vacation: { on: false } }, NOW)).toBeNull();
  });
});

describe('cleanVacation', () => {
  it('refuses a past date and one further than 60 days; strips tags from the note', () => {
    expect(vacation.cleanVacation({ on: true, until: '2026-10-01' }, NOW).error).toMatch(/already passed/);
    expect(vacation.cleanVacation({ on: true, until: '2027-03-01' }, NOW).error).toMatch(/up to 60 days/);
    expect(vacation.cleanVacation({ on: true, until: 'soon' }, NOW).error).toMatch(/not a date/);
    expect(vacation.cleanVacation({ on: true, until: '2026-11-12', note: '<b>Back</b> after Diwali' }, NOW).value).toEqual({ on: true, until: new Date('2026-11-12'), note: 'Back after Diwali' });
    // Turning it off with an old date left in the box is fine - nothing to validate.
    expect(vacation.cleanVacation({ on: false, until: '2026-10-01' }, NOW).value.on).toBe(false);
  });
});

describe('the seller switches it', () => {
  it('saves through settings, drops the list cache, and reports the change in words', async () => {
    const forget = vi.spyOn(hidden, 'forget');
    const seller = { vacation: { on: false, until: null, note: '' }, links: {} };
    const soon = new Date(Date.now() + 10 * 86400 * 1000).toISOString().slice(0, 10);
    const r = await applyShopSettings(seller, { vacation: { on: true, until: soon, note: 'Diwali' } });
    expect(r.error).toBeUndefined();
    expect(seller.vacation).toMatchObject({ on: true, note: 'Diwali' });
    expect(r.changed).toContain('break on');
    expect(forget).toHaveBeenCalled();
    const bad = await applyShopSettings(seller, { vacation: { on: true, until: '2001-01-01' } });
    expect(bad.error).toMatch(/already passed/);
  });
});

describe('checkout', () => {
  it('names the shop and the date, and lets an open shop through', async () => {
    vi.spyOn(Seller, 'find').mockImplementation(() => chain([
      { userId: 'u1', businessName: 'Charming Jewels', vacation: { on: true, until: new Date('2026-11-12T00:00:00Z') } },
      { userId: 'u2', businessName: 'Old', vacation: { on: true, until: new Date('2026-01-01') } },
    ]));
    const hit = await vacation.firstOnBreak(['u1', 'u2', 'u3'], NOW);
    expect(hit).toMatchObject({ sellerId: 'u1', businessName: 'Charming Jewels' });
    expect(hit.message).toBe('Charming Jewels is on a break until 12 Nov. Remove its items to place the rest of the order, or come back then.');
    vi.spyOn(Seller, 'find').mockImplementation(() => chain([]));
    expect(await vacation.firstOnBreak(['u3'], NOW)).toBeNull();
    expect(await vacation.firstOnBreak([], NOW)).toBeNull();
  });
});

describe('the lists', () => {
  it('the filter hiddenSellers adds: switch on, and no date or a date not yet passed', () => {
    const q = vacation.activeFilter(NOW);
    expect(q['vacation.on']).toBe(true);
    expect(q.$or[0]).toEqual({ 'vacation.until': null });
    expect(q.$or[1]['vacation.until'].$gte.toISOString()).toBe('2026-11-04T06:00:00.000Z');
  });
});
