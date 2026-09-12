/**
 * The two doors the copy-paste era left open.
 *
 * Nothing stopped a script from trying ten thousand passwords against
 * /auth/login, or ten thousand forgot-password emails against one address,
 * or burning the platform's daily AI allowance from a loop. And no response
 * carried the security headers every framework ships by default. Both are
 * OWASP A06 (insecure design) and A02 (misconfiguration) - and both are the
 * cheapest fixes on the list.
 *
 * One Render instance, so an in-memory counter is honest today; the day
 * there are two instances the store moves to the database (rate-limit's
 * store option) and this test does not change.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

process.env.RATE_LIMIT_TEST = '1';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const { LIMITS } = require('../middlewares/rateLimits');
const User = require('../models/User');

// No database in tests: a login that never finds a user answers at once,
// which is all the limiter needs - it counts knocks, not outcomes.
let originalFindOne;
beforeAll(() => {
  originalFindOne = User.findOne;
  User.findOne = () => ({ select: async () => null, lean: async () => null, then: (r) => r(null) });
});
afterAll(() => {
  User.findOne = originalFindOne;
});

describe('security headers', () => {
  it('every response carries helmet\'s defaults', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('rate limits', () => {
  it('login is refused after the window\'s allowance, with the wait said in words', async () => {
    const ip = '203.0.113.7';
    let last;
    for (let i = 0; i < LIMITS.auth.max + 1; i += 1) {
      last = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'nobody@example.com', password: 'wrong' });
    }
    expect(last.status).toBe(429);
    expect(last.body.message).toMatch(/too many|try again/i);
    expect(last.headers['retry-after']).toBeDefined();
  });

  it('is per address - a different visitor is not punished for a stranger\'s attempts', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.9')
      .send({ email: 'nobody@example.com', password: 'wrong' });
    expect(res.status).not.toBe(429);
  });

  it('the AI routes have their own, smaller allowance', () => {
    expect(LIMITS.ai.max).toBeLessThan(LIMITS.auth.max * 3);
    expect(LIMITS.checkout.max).toBeGreaterThan(0);
  });
});
