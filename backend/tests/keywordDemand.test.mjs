/**
 * The fourth source: how many people in India search the phrase at all.
 *
 * WHY THIS IS TESTED (27 Sep 2026)
 *   Search Console, our own search box and the synonym table all describe
 *   traffic we ALREADY have. For a shop three weeks old that is a small and
 *   flattering mirror - it cannot name a phrase we have never ranked for,
 *   which is nearly all of them. Keyword Planner is the rest of India.
 *
 *   Every test here guards a way the join could quietly go wrong: a number
 *   that never reaches the prompt, an old brief that crashes the new code, a
 *   zero that reads as a measurement, or an Ads account that is simply not
 *   configured on this box - which must cost nothing at all, because the
 *   weekly job runs whether or not Google is reachable.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assembleBrief, briefToText, keywordVolumes } = require('../utils/ai/marketBrief.js');

const CATEGORY = { name: 'Jewellery', slug: 'jewellery' };

const build = (over = {}) =>
  assembleBrief({
    category: CATEGORY,
    grounded: { words: ['kundan choker'], band: null, sources: [], trending: [], note: '' },
    searchConsole: [],
    siteSearches: [],
    weekOf: '2026-09-21',
    ...over,
  });

describe('the number travels with the word', () => {
  it('keeps monthly on a word Keyword Planner reported', () => {
    const b = build({ adsWords: [{ keyword: 'kundan choker set', monthly: 4400, competition: 'HIGH' }] });
    const row = b.words.find((w) => w.word === 'kundan choker set');

    expect(row.monthly).toBe(4400);
    expect(row.sources).toContain('ads');
  });

  it('adds ads to a word the other sources already found, rather than duplicating it', () => {
    const b = build({
      searchConsole: [{ query: 'kundan choker', impressions: 40, clicks: 1 }],
      adsWords: [{ keyword: 'kundan choker', monthly: 2900 }],
    });
    const rows = b.words.filter((w) => w.word === 'kundan choker');

    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toEqual(expect.arrayContaining(['google', 'ads']));
    expect(rows[0].monthly).toBe(2900);
  });

  it('leaves monthly off entirely when there is no figure', () => {
    // Absent must mean "we do not know". A stored 0 would later read as
    // "nobody searches this", which Google never said.
    const b = build({ adsWords: [] });
    const row = b.words.find((w) => w.word === 'kundan choker');

    expect(row).toBeDefined();
    expect('monthly' in row).toBe(false);
  });

  it('puts the figure in the text the assistant reads', () => {
    const b = build({ adsWords: [{ keyword: 'kundan choker set', monthly: 4400 }] });
    expect(briefToText(b)).toContain('kundan choker set [ads] 4400/month in India');
  });

  it('still ranks agreement above a big lonely number', () => {
    // A phrase Google, the site and the model all name is worth more than a
    // phrase with a large number and no local evidence. The number decides
    // the ORDER downstream, not the place in the brief.
    const b = build({
      searchConsole: [{ query: 'jaipur kundan choker', impressions: 30, clicks: 2 }],
      siteSearches: [{ term: 'jaipur kundan choker', count: 9 }],
      grounded: { words: ['jaipur kundan choker'], band: null, sources: [], trending: [], note: '' },
      adsWords: [{ keyword: 'gold necklace', monthly: 90000 }],
    });
    expect(b.words[0].word).toBe('jaipur kundan choker');
  });
});

describe('an Ads account that is not there costs nothing', () => {
  it('returns no words when the API declines, instead of throwing', async () => {
    const ads = { keywordIdeas: async () => ({ ok: false, reason: 'Google Ads is not connected (GOOGLE_ADS_DEVELOPER_TOKEN)', rows: [] }) };
    expect(await keywordVolumes(['jewellery'], { ads })).toEqual([]);
  });

  it('survives the module throwing outright', async () => {
    const ads = {
      keywordIdeas: async () => {
        throw new Error('network down');
      },
    };
    expect(await keywordVolumes(['jewellery'], { ads })).toEqual([]);
  });

  it('drops phrases Google reports as zero, and keeps the head of the list', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ keyword: `w${i}`, monthly: 40 - i, competition: 'LOW' }));
    rows.push({ keyword: 'too rare to report', monthly: 0 });
    const ads = { keywordIdeas: async () => ({ ok: true, rows }) };

    const out = await keywordVolumes(['jewellery'], { ads });
    expect(out).toHaveLength(25);
    expect(out.some((r) => r.keyword === 'too rare to report')).toBe(false);
  });

  it('sends each seed once, lowercased and trimmed', async () => {
    let seen = null;
    const ads = {
      keywordIdeas: async (seeds) => {
        seen = seeds;
        return { ok: true, rows: [] };
      },
    };
    await keywordVolumes(['Jewellery', ' jewellery ', '', 'Kundan Choker'], { ads });
    expect(seen).toEqual(['jewellery', 'kundan choker']);
  });
});
