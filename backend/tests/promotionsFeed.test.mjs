/**
 * Coupons → Merchant Center promotions feed: only codes a Google visitor can
 * redeem, in the columns and formats Google's spec names.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { eligible, row, tsv, COLUMNS, istStamp } = require('../utils/promotionsFeed');

const now = new Date('2026-09-13T00:00:00Z');
const base = { isActive: true, fundedBy: 'platform', usedCount: 0, usageLimit: null, minOrderValue: 0, validFrom: new Date('2026-09-10T00:00:00Z') };

describe('eligible', () => {
  it('drops expired, inactive, exhausted and other sellers coupons', () => {
    const rows = eligible(
      [
        { ...base, code: 'LIVE', type: 'percent', value: 15, validUntil: new Date('2026-10-10T00:00:00Z') },
        { ...base, code: 'OLD', type: 'percent', value: 10, validUntil: new Date('2026-09-01T00:00:00Z') },
        { ...base, code: 'OFF', type: 'flat', value: 100, isActive: false },
        { ...base, code: 'USED', type: 'flat', value: 100, usageLimit: 5, usedCount: 5 },
        { ...base, code: 'CJ100', type: 'flat', value: 100, fundedBy: 'seller', sellerId: 'house' },
        { ...base, code: 'OTHER', type: 'flat', value: 50, fundedBy: 'seller', sellerId: 'partner' },
      ],
      { now, sellerIds: new Set(['house']) }
    ).map((c) => c.code);
    expect(rows).toEqual(['LIVE', 'CJ100']);
  });
});

describe('row', () => {
  it('writes a percent coupon in Google’s columns, IST dates, title under 60 chars', () => {
    const r = row({ ...base, code: 'JAIPUR15', type: 'percent', value: 15, maxDiscount: 300, minOrderValue: 999, validUntil: new Date('2026-10-10T18:29:59Z') }, { now });
    const o = Object.fromEntries(COLUMNS.map((k, i) => [k, r[i]]));
    expect(o.promotion_id).toBe('smp_jaipur15');
    expect(o.offer_type).toBe('generic_code');
    expect(o.generic_redemption_code).toBe('JAIPUR15');
    expect(o.long_title.length).toBeLessThanOrEqual(60);
    expect(o.long_title).toContain('15% off');
    expect(o.promotion_effective_dates).toBe('2026-09-13T05:30:00+05:30/2026-10-10T23:59:59+05:30');
    expect(o.redemption_channel).toBe('online');
    expect(o.promotion_destination).toBe('free_listings');
    expect(o.coupon_value_type).toBe('percent_off');
    expect(o.percent_off).toBe('15');
    expect(o.money_off_amount).toBe('');
    expect(o.minimum_purchase_amount).toBe('999.00 INR');
  });

  it('writes a flat coupon as money_off in INR and invents an end date when there is none', () => {
    const r = row({ ...base, code: 'CJ100', type: 'flat', value: 100, validUntil: null }, { now });
    const o = Object.fromEntries(COLUMNS.map((k, i) => [k, r[i]]));
    expect(o.coupon_value_type).toBe('money_off');
    expect(o.money_off_amount).toBe('100.00 INR');
    expect(o.promotion_effective_dates.split('/')[1]).toMatch(/^2027-03-1\dT/);
  });
});

describe('tsv', () => {
  it('is a header plus one tab-separated line per coupon', () => {
    const out = tsv([{ ...base, code: 'A1', type: 'flat', value: 50, validUntil: new Date('2026-10-01T00:00:00Z') }], { now });
    // Not trim(): the last column can be empty, and trim would eat its tab.
    const lines = out.replace(/\n$/, '').split('\n');
    expect(lines[0].split('\t')).toEqual(COLUMNS);
    expect(lines).toHaveLength(2);
    expect(lines[1].split('\t')).toHaveLength(COLUMNS.length);
  });
  it('istStamp shifts UTC to IST wall clock with the zone written', () => {
    expect(istStamp('2026-09-13T00:00:00Z')).toBe('2026-09-13T05:30:00+05:30');
  });
});
