/**
 * Transactional email delivery.
 *
 * The failure this defends against: SendGrid returned
 * `401 {"errors":[{"message":"Maximum credits exceeded"}]}` for weeks and
 * nothing surfaced it. A customer who never receives their OTP cannot report
 * it, so the only defence is that a rejected send throws LOUDLY, carrying the
 * provider's own reason.
 *
 * The rules being defended:
 *   1. a rejected send throws, and the provider's reason survives in the message
 *   2. a missing API key or sender is a configuration error, not a silent no-op
 *   3. the request is shaped the way Brevo's API expects
 *   4. a text-only caller still produces htmlContent, which Brevo requires
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sendEmail = require('../utils/sendEmail');

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const okResponse = () => ({
  ok: true,
  status: 201,
  text: async () => '{"messageId":"<test@brevo>"}',
});

let originalFetch;
let originalEnv;

beforeEach(() => {
  originalFetch = global.fetch;
  originalEnv = { ...process.env };
  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_FROM_EMAIL = 'no-reply@shopmasterpro.in';
  delete process.env.BREVO_FROM_NAME;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = originalEnv;
});

describe('sending a transactional email', () => {
  it('posts to Brevo in the shape its API expects', async () => {
    global.fetch = vi.fn(async () => okResponse());

    await sendEmail({
      to: 'buyer@example.com',
      subject: 'ShopMaster Pro - Verify your email',
      text: 'Your OTP is 123456',
      html: '<p>Your OTP is <strong>123456</strong></p>',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];

    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    // Brevo authenticates on its own header, not a bearer token.
    expect(init.headers['api-key']).toBe('test-key');

    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({
      email: 'no-reply@shopmasterpro.in',
      name: 'ShopMaster Pro',
    });
    expect(body.to).toEqual([{ email: 'buyer@example.com' }]);
    expect(body.subject).toBe('ShopMaster Pro - Verify your email');
    expect(body.htmlContent).toContain('123456');
    expect(body.textContent).toBe('Your OTP is 123456');
  });

  it('still sends htmlContent when the caller only had plain text', async () => {
    global.fetch = vi.fn(async () => okResponse());

    await sendEmail({ to: 'buyer@example.com', subject: 'Hi', text: 'Plain only' });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    // Brevo rejects a message with neither htmlContent nor a templateId.
    expect(body.htmlContent).toBe('<p>Plain only</p>');
  });

  /**
   * The exact outage that went unnoticed for weeks.
   */
  it('throws and keeps the provider\'s reason when the send is rejected', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => '{"errors":[{"message":"Maximum credits exceeded"}]}',
    }));

    await expect(
      sendEmail({ to: 'buyer@example.com', subject: 'Hi', html: '<p>Hi</p>' })
    ).rejects.toThrow(/Maximum credits exceeded/);
  });

  it('reports a network failure as unreachable rather than as a rejection', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.brevo.com');
    });

    await expect(
      sendEmail({ to: 'buyer@example.com', subject: 'Hi', html: '<p>Hi</p>' })
    ).rejects.toThrow(/unreachable/i);
  });

  it('refuses to run without an API key, instead of quietly sending nothing', async () => {
    delete process.env.BREVO_API_KEY;
    global.fetch = vi.fn(async () => okResponse());

    await expect(
      sendEmail({ to: 'buyer@example.com', subject: 'Hi', html: '<p>Hi</p>' })
    ).rejects.toThrow(/BREVO_API_KEY/);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses to run without a sender address', async () => {
    delete process.env.BREVO_FROM_EMAIL;
    global.fetch = vi.fn(async () => okResponse());

    await expect(
      sendEmail({ to: 'buyer@example.com', subject: 'Hi', html: '<p>Hi</p>' })
    ).rejects.toThrow(/BREVO_FROM_EMAIL/);
  });

  it('uses a configured sender name when one is set', async () => {
    process.env.BREVO_FROM_NAME = 'Charming Jewels';
    global.fetch = vi.fn(async () => okResponse());

    await sendEmail({ to: 'buyer@example.com', subject: 'Hi', html: '<p>Hi</p>' });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.sender.name).toBe('Charming Jewels');
  });
});
