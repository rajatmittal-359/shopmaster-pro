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
    const v = summariseViews([], 28, NOW);
    expect(v.total).toBe(0);
    expect(v.recent).toBe(0);
    expect(v.days).toBe(28);
    // A new listing still gets a full line of zeroes to draw, not an empty one.
    expect(v.daily).toHaveLength(28);
    expect(v.counted).toBe(0);
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

/**
 * THE TREND LINE AND THE SPLIT (28 Sep 2026)
 *
 *   Both are drawn, so both fail quietly when they are wrong: a line with the
 *   empty days missing has the wrong SHAPE while every number on the page is
 *   right, and a split that silently counts un-bucketed views as "direct"
 *   would tell a seller their WhatsApp forwards did nothing.
 */
describe('summariseViews - the day-by-day line', () => {
  it('has one point per day in the window, oldest first, ending today', () => {
    const v = summariseViews([{ day: '2026-09-27', count: 5 }], 28, NOW);

    expect(v.daily).toHaveLength(28);
    expect(v.daily[0].day).toBe('2026-08-31');
    expect(v.daily[27].day).toBe('2026-09-27');
  });

  it('fills a day with no row as zero rather than leaving it out', () => {
    // Two spikes with a quiet week between them. Drawn from only the rows
    // that exist, this would read as a flat, healthy line.
    const v = summariseViews(
      [
        { day: '2026-09-20', count: 9 },
        { day: '2026-09-27', count: 9 },
      ],
      28,
      NOW
    );

    expect(v.daily.filter((d) => d.count === 0)).toHaveLength(26);
    expect(v.daily.at(-1)).toEqual({ day: '2026-09-27', count: 9 });
  });

  it('leaves older views out of the line but keeps them in the total', () => {
    const v = summariseViews([{ day: '2026-01-01', count: 40 }, { day: '2026-09-27', count: 2 }], 28, NOW);

    expect(v.daily.reduce((n, d) => n + d.count, 0)).toBe(2);
    expect(v.total).toBe(42);
  });
});

describe('summariseViews - where the visits came from', () => {
  const row = (day, count, sources) => ({ day, count, sources });

  it('adds the buckets up across the window', () => {
    const v = summariseViews(
      [
        row('2026-09-27', 5, { social: 3, search: 2 }),
        row('2026-09-26', 4, { social: 1, site: 3 }),
      ],
      28,
      NOW
    );

    expect(v.sources).toEqual({ direct: 0, site: 3, search: 2, social: 4, other: 0 });
    expect(v.counted).toBe(9);
  });

  it('ignores the split on rows older than the window, as the line does', () => {
    const v = summariseViews([row('2026-01-01', 40, { social: 40 })], 28, NOW);

    expect(v.counted).toBe(0);
    expect(v.sources.social).toBe(0);
  });

  it('does not pretend an un-split view was direct', () => {
    // Rows from before the split existed carry a count and no `sources`.
    const v = summariseViews([{ day: '2026-09-27', count: 6 }], 28, NOW);

    expect(v.recent).toBe(6);
    expect(v.counted).toBe(0);
    expect(v.sources.direct).toBe(0);
    // `counted` below `recent` is the page's cue to say so out loud rather
    // than drawing a bar chart of nothing.
    expect(v.counted).toBeLessThan(v.recent);
  });

  it('never claims more split views than views', () => {
    const v = summariseViews([row('2026-09-27', 5, { social: 3, search: 2 })], 28, NOW);
    expect(v.counted).toBeLessThanOrEqual(v.recent);
  });
});
