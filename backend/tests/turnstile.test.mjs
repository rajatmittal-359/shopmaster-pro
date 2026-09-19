/**
 * Turnstile (plan 2.28): off without the secret, a bad or missing token is a
 * 400 in words, and a Cloudflare outage never locks the door.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { requireTurnstile, verify } = require('../middlewares/turnstile');

const run = async (body) => {
  const req = { body, ip: '1.2.3.4', path: '/api/auth/register' };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  const next = vi.fn();
  await requireTurnstile(req, res, next);
  return { res, next };
};

describe('turnstile', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.TURNSTILE_SECRET = 'sec';
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.TURNSTILE_SECRET;
    vi.restoreAllMocks();
  });

  it('without a secret nothing is checked', async () => {
    delete process.env.TURNSTILE_SECRET;
    global.fetch = vi.fn();
    const { next } = await run({});
    expect(next).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a missing token is refused before Cloudflare is asked', async () => {
    global.fetch = vi.fn();
    const { res, next } = await run({ email: 'a@b.c' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('turnstile');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a real token passes; the secret and the visitor address go to siteverify', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    const { next } = await run({ turnstileToken: 'tok' });
    expect(next).toHaveBeenCalled();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
    expect(String(init.body)).toContain('secret=sec');
    expect(String(init.body)).toContain('response=tok');
    expect(String(init.body)).toContain('remoteip=1.2.3.4');
  });

  it('a token Cloudflare rejects is a 400 with the reason logged', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }) }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { res, next } = await run({ turnstileToken: 'old' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(warn.mock.calls[0].join(' ')).toMatch(/timeout-or-duplicate/);
  });

  it('a Cloudflare outage lets the request through and says so - a third party down must not close sign-up', async () => {
    global.fetch = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { next } = await run({ turnstileToken: 'tok' });
    expect(next).toHaveBeenCalled();
    expect(err.mock.calls[0].join(' ')).toMatch(/unreachable/);
    expect(await verify('tok')).toMatchObject({ ok: true, outage: true });
  });
});
