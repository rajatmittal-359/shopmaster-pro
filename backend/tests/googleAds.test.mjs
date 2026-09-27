/**
 * Google Ads, without calling Google.
 *
 * WHY THESE AND NOT OTHERS (27 Sep 2026)
 *   Everything here is a thing that has already gone wrong once, or that
 *   would fail silently months from now on the box:
 *
 *   - The refresh token spent an hour looking correct while being bound to
 *     the OAuth Playground's client instead of ours. That failure surfaces
 *     as `invalid_grant` at refresh time, so the message has to say what to
 *     do about it.
 *   - `login-customer-id` is what makes a manager account reach the account
 *     it manages. Omit it and Google answers PERMISSION_DENIED with no clue.
 *   - Ads ids are written 525-586-3360 and sent 5255863360.
 *   - Google buries the real error three levels down and puts a useless one
 *     at the top.
 *   - A missing developer token must be a sentence in the panel, never a
 *     thrown 500.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ads = require('../utils/google/ads.js');
const adsAuth = require('../utils/google/adsAuth.js');

const ENV_KEYS = [
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
];
const saved = {};

/** A fetch that answers the token endpoint, then hands the API call to `api`. */
const fakeFetch = (api, { token = { access_token: 'ya29.test', expires_in: 3599 } } = {}) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, json: async () => token };
    }
    return api(url, init);
  };
  fn.calls = calls;
  return fn;
};

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.GOOGLE_ADS_CLIENT_ID = 'cid';
  process.env.GOOGLE_ADS_CLIENT_SECRET = 'secret';
  process.env.GOOGLE_ADS_REFRESH_TOKEN = '1//refresh';
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'devtoken';
  process.env.GOOGLE_ADS_CUSTOMER_ID = '525-586-3360';
  process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = '877-681-8872';
  adsAuth._reset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  adsAuth._reset();
});

describe('the headers Google actually checks', () => {
  it('sends the dashed account id as digits, in the URL', async () => {
    const f = fakeFetch(ok({ results: [] }));
    await ads.search('SELECT campaign.id FROM campaign', {}, { fetch: f });

    const apiCall = f.calls.find((c) => String(c.url).includes('googleads.googleapis.com'));
    expect(apiCall.url).toContain('/customers/5255863360/googleAds:search');
    expect(apiCall.url).not.toContain('525-586-3360');
  });

  it('sends login-customer-id, without which a managed account is PERMISSION_DENIED', async () => {
    const f = fakeFetch(ok({ results: [] }));
    await ads.search('SELECT campaign.id FROM campaign', {}, { fetch: f });

    const h = f.calls.find((c) => String(c.url).includes('googleads')).init.headers;
    expect(h['login-customer-id']).toBe('8776818872');
    expect(h['developer-token']).toBe('devtoken');
    expect(h.Authorization).toBe('Bearer ya29.test');
  });

  it('leaves login-customer-id off entirely when there is no manager', async () => {
    delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    const f = fakeFetch(ok({ results: [] }));
    await ads.search('SELECT campaign.id FROM campaign', {}, { fetch: f });

    const h = f.calls.find((c) => String(c.url).includes('googleads')).init.headers;
    // Absent, not empty string - Google rejects a blank one.
    expect('login-customer-id' in h).toBe(false);
  });

  it('asks a version that is still alive', () => {
    // v21 was already sunset on the day this was written.
    expect(Number(ads.VERSION.replace('v', ''))).toBeGreaterThanOrEqual(23);
  });
});

describe('when something is missing, it says which thing', () => {
  it('names the absent env var instead of throwing', async () => {
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const out = await ads.accounts({ fetch: fakeFetch(ok({})) });

    expect(out.ok).toBe(false);
    expect(out.reason).toContain('GOOGLE_ADS_DEVELOPER_TOKEN');
    expect(out.rows).toEqual([]);
  });

  it('never calls Google at all when unconfigured', async () => {
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const f = fakeFetch(ok({}));
    await ads.accounts({ fetch: f });
    expect(f.calls).toHaveLength(0);
  });

  it('health() reports not-connected rather than blowing up the panel', async () => {
    delete process.env.GOOGLE_ADS_CLIENT_ID;
    const out = await ads.health({ fetch: fakeFetch(ok({})) });
    expect(out.connected).toBe(false);
    expect(out.reason).toContain('GOOGLE_ADS_CLIENT_ID');
  });
});

describe('a refresh token bound to the wrong client', () => {
  it('explains how to fix invalid_grant instead of repeating Google', async () => {
    const f = async (url) => {
      if (String(url).includes('oauth2')) {
        return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
      }
      throw new Error('should never reach the Ads API');
    };
    await expect(adsAuth.accessToken({ fetch: f })).rejects.toThrow(/OAuth Playground with OUR client/);
  });

  it('mints once and reuses the token for the next call', async () => {
    const f = fakeFetch(ok({ results: [] }));
    await ads.search('SELECT campaign.id FROM campaign', {}, { fetch: f });
    await ads.search('SELECT campaign.id FROM campaign', {}, { fetch: f });

    const tokenCalls = f.calls.filter((c) => String(c.url).includes('oauth2'));
    expect(tokenCalls).toHaveLength(1);
  });
});

describe('Google errors, unburied', () => {
  it('pulls the real sentence out of error.details[].errors[]', async () => {
    const f = fakeFetch(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          message: 'Request contains an invalid argument.',
          details: [{ errors: [{ message: 'The developer token is only approved for use with test accounts.' }] }],
        },
      }),
    }));
    const out = await ads.accounts({ fetch: f });

    expect(out.ok).toBe(false);
    expect(out.reason).toBe('The developer token is only approved for use with test accounts.');
    expect(out.status).toBe(403);
  });

  it('survives a network failure as a reason, not an exception', async () => {
    const f = fakeFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    const out = await ads.accounts({ fetch: f });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('ENOTFOUND');
  });
});

describe('what the search-word coach will read', () => {
  it('returns keywords biggest-first with the volume as a number', async () => {
    const f = fakeFetch(
      ok({
        results: [
          { text: 'kundan necklace set', keywordIdeaMetrics: { avgMonthlySearches: '880', competition: 'HIGH' } },
          { text: 'kundan choker', keywordIdeaMetrics: { avgMonthlySearches: '6600', competition: 'MEDIUM' } },
          { text: 'kundan choker jaipur' }, // too few searches to report
        ],
      })
    );
    const out = await ads.keywordIdeas(['kundan choker'], {}, { fetch: f });

    expect(out.ok).toBe(true);
    expect(out.rows.map((r) => r.keyword)).toEqual(['kundan choker', 'kundan necklace set', 'kundan choker jaipur']);
    // A string on the wire would sort as text: '880' > '6600'.
    expect(out.rows[0].monthly).toBe(6600);
    expect(out.rows[2].monthly).toBe(0);
    expect(out.rows[2].competition).toBe('UNSPECIFIED');
  });

  it('targets India and English by default, as criterion ids', async () => {
    const f = fakeFetch(ok({ results: [] }));
    await ads.keywordIdeas(['choker'], {}, { fetch: f });

    const body = JSON.parse(f.calls.find((c) => String(c.url).includes('generateKeywordIdeas')).init.body);
    expect(body.geoTargetConstants).toEqual(['geoTargetConstants/2356']);
    expect(body.language).toBe('languageConstants/1000');
    expect(body.keywordSeed.keywords).toEqual(['choker']);
  });

  it('asks Google nothing when every seed is blank', async () => {
    const f = fakeFetch(ok({ results: [] }));
    const out = await ads.keywordIdeas(['', '   '], {}, { fetch: f });

    expect(out).toEqual({ ok: true, rows: [] });
    expect(f.calls).toHaveLength(0);
  });

  it('caps the seeds at the twenty Google allows', async () => {
    const f = fakeFetch(ok({ results: [] }));
    await ads.keywordIdeas(Array.from({ length: 30 }, (_, i) => `word ${i}`), {}, { fetch: f });

    const body = JSON.parse(f.calls.find((c) => String(c.url).includes('generateKeywordIdeas')).init.body);
    expect(body.keywordSeed.keywords).toHaveLength(20);
  });
});

describe('accounts()', () => {
  it('turns resource names into plain ids', async () => {
    const f = fakeFetch(ok({ resourceNames: ['customers/5255863360', 'customers/8776818872'] }));
    const out = await ads.accounts({ fetch: f });
    expect(out.rows).toEqual(['5255863360', '8776818872']);
  });
});
