/**
 * The view counter's arithmetic - the part a browser check cannot prove.
 *
 * WHY THIS EXISTS (27 Sep 2026)
 *   The seller's report page prints "page opened, last 28 days". Two things
 *   decide whether that number is true, and neither is visible by clicking:
 *
 *   1. WHICH DAY a view lands in. Rows are keyed by day, and the day has to
 *      be Jaipur's. A view at 02:00 IST is still the previous day in UTC, so
 *      a UTC key would file the whole of the country's late evening under
 *      tomorrow - and on the 1st of a month, into the wrong month.
 *   2. WHICH DAYS the window includes. An off-by-one here is silent: the
 *      number is simply a little wrong, forever, and nobody can tell.
 *
 *   Both were got right by reasoning, which is exactly the kind of thing that
 *   turns out to be wrong six months later when someone edits it.
 */
import { describe, it, expect } from 'vitest';
import pkg from '../utils/productViews.js';

const { istDay, summariseViews } = pkg;

// A fixed "now": 27 Sep 2026, midday in Jaipur. Passed in rather than faked
// globally, which is why the arithmetic was split out of the database read.
const NOW = new Date('2026-09-27T06:30:00Z');

describe('istDay - the day a Jaipur seller means', () => {
  it('is the IST date, not the UTC one, late in the evening', () => {
    // 27 Sep 19:30 UTC is 28 Sep 01:00 in Jaipur.
    expect(istDay(new Date('2026-09-27T19:30:00Z'))).toBe('2026-09-28');
  });

  it('is still yesterday just before IST midnight', () => {
    // 27 Sep 18:29 UTC is 27 Sep 23:59 in Jaipur.
    expect(istDay(new Date('2026-09-27T18:29:00Z'))).toBe('2026-09-27');
  });

  it('rolls the month on IST midnight, not UTC midnight', () => {
    expect(istDay(new Date('2026-09-30T18:31:00Z'))).toBe('2026-10-01');
  });
});

describe('summariseViews - the window', () => {
  it('counts today and the 27 days before it, and nothing older', () => {
    const v = summariseViews(
      [
        { day: '2026-09-27', count: 5 }, // today
        { day: '2026-08-31', count: 7 }, // the 28th day back - the edge, included
        { day: '2026-08-30', count: 99 }, // one day too old
      ],
      28,
      NOW
    );
    expect(v.recent).toBe(12);
    expect(v.total).toBe(111);
  });

  it('counts a listing with no views at all as zero, not as missing', () => {
    expect(summariseViews([], 28, NOW)).toEqual({ total: 0, recent: 0, days: 28 });
  });

  it('never reports more in the window than in all time', () => {
    const v = summariseViews([{ day: '2026-09-27', count: 3 }, { day: '2026-01-01', count: 40 }], 28, NOW);
    expect(v.recent).toBe(3);
    expect(v.total).toBe(43);
    expect(v.recent).toBeLessThanOrEqual(v.total);
  });

  it('a view just after IST midnight lands in the new day, so it is inside the window', () => {
    // 02:00 IST on the 28th is still the 27th in UTC.
    expect(istDay(new Date('2026-09-27T20:30:00Z'))).toBe('2026-09-28');
    const v = summariseViews([{ day: '2026-09-28', count: 4 }], 28, new Date('2026-09-28T20:30:00Z'));
    expect(v.recent).toBe(4);
  });
});
