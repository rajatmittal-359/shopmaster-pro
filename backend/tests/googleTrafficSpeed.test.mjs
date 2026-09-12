/**
 * GA4 and PageSpeed, read through the backend: silent without their keys,
 * shaped for the admin cards when they answer.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('GA4 overview', () => {
  const { overview } = require('../utils/google/analytics');

  it('says not connected without a property id', async () => {
    const saved = process.env.GA4_PROPERTY_ID;
    delete process.env.GA4_PROPERTY_ID;
    const out = await overview({ days: 28 });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/not connected/);
    if (saved) process.env.GA4_PROPERTY_ID = saved;
  });
});

describe('PageSpeed', () => {
  const { analyse, rate } = require('../utils/google/pagespeed');

  it('rates the vitals on Google thresholds', () => {
    expect(rate('LCP', 2000)).toBe('good');
    expect(rate('LCP', 3000)).toBe('needs-improvement');
    expect(rate('LCP', 5000)).toBe('poor');
    expect(rate('CLS', 0.05)).toBe('good');
    expect(rate('INP', null)).toBe(null);
  });

  it('keeps the score, lab vitals and field data from a Lighthouse answer', async () => {
    process.env.PAGESPEED_API_KEY = 'test';
    const out = await analyse('https://www.shopmasterpro.in/', {}, {
      fetch: async () => ({
        ok: true,
        json: async () => ({
          lighthouseResult: {
            categories: { performance: { score: 0.87 } },
            audits: {
              'largest-contentful-paint': { numericValue: 2100 },
              'cumulative-layout-shift': { numericValue: 0.02 },
              'total-blocking-time': { numericValue: 350 },
            },
          },
          loadingExperience: { overall_category: 'FAST', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1800 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 }, INTERACTION_TO_NEXT_PAINT: { percentile: 150 } } },
        }),
      }),
    });
    delete process.env.PAGESPEED_API_KEY;
    expect(out.score).toBe(87);
    expect(out.lab.LCP).toEqual({ value: 2100, rating: 'good' });
    expect(out.lab.TBT.rating).toBe('needs-improvement');
    expect(out.field.CLS).toEqual({ value: 0.05, rating: 'good' });
    expect(out.field.hasData).toBe(true);
  });

  it('is silent without a key', async () => {
    delete process.env.PAGESPEED_API_KEY;
    expect((await analyse('https://x')).ok).toBe(false);
  });
});
