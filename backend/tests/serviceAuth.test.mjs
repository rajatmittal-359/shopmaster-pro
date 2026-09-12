/**
 * The backend's own Google identity, minted without a library.
 *
 * A signed JWT swapped for a token, cached until it expires; Search Console
 * queries read through it. The key never leaves `private/` (locally) or an
 * env var (Render); tests use a throwaway RSA key and a fake token endpoint.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { generateKeyPairSync } from 'crypto';

const require = createRequire(import.meta.url);

let saved;
beforeAll(() => {
  saved = { json: process.env.GOOGLE_SA_KEY_JSON, file: process.env.GOOGLE_SA_KEY_FILE, site: process.env.GSC_SITE };
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GOOGLE_SA_KEY_JSON = JSON.stringify({
    client_email: 'test@project.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
  delete process.env.GOOGLE_SA_KEY_FILE;
  process.env.GSC_SITE = 'sc-domain:example.in';
});
afterAll(() => {
  process.env.GOOGLE_SA_KEY_JSON = saved.json;
  if (saved.file) process.env.GOOGLE_SA_KEY_FILE = saved.file;
  process.env.GSC_SITE = saved.site;
});

const fakeFetch = (log) => async (url, init) => {
  log.push({ url: String(url), init });
  if (String(url).includes('oauth2.googleapis.com/token')) {
    const assertion = new URLSearchParams(init.body).get('assertion');
    const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
    log.push({ claims });
    return { ok: true, status: 200, json: async () => ({ access_token: 'tok-1', expires_in: 3600 }) };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ rows: [{ keys: ['kundan choker', 'https://www.example.in/products/x'], clicks: 2, impressions: 40, ctr: 0.05, position: 17.94 }] }),
  };
};

describe('service auth + search console', () => {
  it('signs a JWT for the right account and scope, then reads queries with the token', async () => {
    const { _reset } = require('../utils/google/serviceAuth');
    _reset();
    const { queries } = require('../utils/google/searchConsole');
    const log = [];
    const out = await queries({ days: 28, pageContains: '/products/x' }, { fetch: fakeFetch(log) });
    const claims = log.find((l) => l.claims).claims;
    expect(claims.iss).toBe('test@project.iam.gserviceaccount.com');
    expect(claims.scope).toContain('webmasters.readonly');
    const call = log.find((l) => l.url && l.url.includes('searchAnalytics'));
    expect(call.init.headers.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(call.init.body).dimensionFilterGroups[0].filters[0].expression).toBe('/products/x');
    expect(out.ok).toBe(true);
    expect(out.rows[0]).toMatchObject({ query: 'kundan choker', impressions: 40, position: 17.9 });
  });

  it('reuses the token instead of minting one per call', async () => {
    const { queries } = require('../utils/google/searchConsole');
    const log = [];
    await queries({}, { fetch: fakeFetch(log) });
    expect(log.some((l) => l.url && l.url.includes('oauth2.googleapis.com'))).toBe(false);
  });
});
