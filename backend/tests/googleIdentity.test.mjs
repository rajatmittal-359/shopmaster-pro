/**
 * The checks that stand between a Google sign-in and somebody else's account.
 *
 * WHY THIS FILE EXISTS
 *   Every failure here is an authentication bypass, not a bug. A token issued
 *   for a DIFFERENT app is still a real, correctly-signed Google token: without
 *   the audience check, anybody who can get a token for their own app can send
 *   it here and be signed in as that user. And because accounts are linked by
 *   verified email, accepting `email_verified: false` would let somebody claim
 *   an address they do not own and walk into the account that already has it.
 *
 *   The signature itself is Google's library's job. These tests cover the
 *   claims, which are ours.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
let verifyGoogleCredential;

const payload = (extra = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  email: 'Someone@Example.com',
  email_verified: true,
  name: 'Someone',
  ...extra,
});

/** Stands in for Google: returns whatever payload the test wants. */
const verifierFor = (given) => ({ verify: async () => given });

beforeEach(async () => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  // Re-required per test because the module reads the id at load time.
  delete require.cache[require.resolve('../utils/googleIdentity')];
  ({ verifyGoogleCredential } = require('../utils/googleIdentity'));
});

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
});

describe('a token that checks out', () => {
  it('returns the permanent id, the email lowercased, and a name', async () => {
    const identity = await verifyGoogleCredential('token', verifierFor(payload()));

    expect(identity.googleId).toBe('1234567890');
    // Lowercased because we look accounts up by it, and Google does not
    // normalise the case it sends.
    expect(identity.email).toBe('someone@example.com');
    expect(identity.name).toBe('Someone');
  });

  it('falls back to the email name when Google sends no name', async () => {
    const identity = await verifyGoogleCredential(
      'token',
      verifierFor(payload({ name: undefined, given_name: undefined }))
    );

    // Keeps the case Google sent. The EMAIL is lowercased because we look
    // accounts up by it; a person's name is not a lookup key, and "someone"
    // printed on an order reads like a mistake.
    expect(identity.name).toBe('Someone');
  });

  it('accepts either issuer spelling Google uses', async () => {
    const identity = await verifyGoogleCredential(
      'token',
      verifierFor(payload({ iss: 'accounts.google.com' }))
    );

    expect(identity.googleId).toBe('1234567890');
  });
});

describe('what it refuses', () => {
  it('refuses a token issued for a DIFFERENT app', async () => {
    // The whole reason this file exists. Correctly signed by Google, and still
    // not ours.
    await expect(
      verifyGoogleCredential('token', verifierFor(payload({ aud: 'someone-elses-app' })))
    ).rejects.toThrow(/different app/i);
  });

  it('refuses a token that did not come from Google', async () => {
    await expect(
      verifyGoogleCredential('token', verifierFor(payload({ iss: 'https://evil.example' })))
    ).rejects.toThrow(/did not come from Google/i);
  });

  it('refuses an unverified email, because accounts are linked by it', async () => {
    await expect(
      verifyGoogleCredential('token', verifierFor(payload({ email_verified: false })))
    ).rejects.toThrow(/verified email/i);
  });

  it('refuses a token with no email at all', async () => {
    await expect(
      verifyGoogleCredential('token', verifierFor(payload({ email: undefined })))
    ).rejects.toThrow(/verified email/i);
  });

  it('refuses a payload with no subject', async () => {
    await expect(
      verifyGoogleCredential('token', verifierFor(payload({ sub: undefined })))
    ).rejects.toThrow(/account id/i);
  });

  it('never passes on the library message, which quotes the token back', async () => {
    // google-auth-library throws "Wrong number of segments in token: <token>".
    // That message would reach the browser as a 401, putting a credential into
    // a screen, a screenshot, and the support email that follows.
    const throwing = {
      verify: async () => {
        throw new Error('Wrong number of segments in token: eyJhbGciOi.SECRET.value');
      },
    };

    await expect(verifyGoogleCredential('token', throwing)).rejects.toThrow(
      /could not be verified/i
    );
    await expect(verifyGoogleCredential('token', throwing)).rejects.not.toThrow(/SECRET/);
  });

  it('refuses an empty credential without calling Google', async () => {
    await expect(verifyGoogleCredential('')).rejects.toThrow(/No Google credential/i);
    await expect(verifyGoogleCredential(null)).rejects.toThrow(/No Google credential/i);
  });

  it('refuses to run at all when the server has no client id', async () => {
    // Failing loudly beats skipping the audience check, which is what an
    // unset id would mean.
    delete process.env.GOOGLE_CLIENT_ID;
    delete require.cache[require.resolve('../utils/googleIdentity')];
    const fresh = require('../utils/googleIdentity');

    await expect(fresh.verifyGoogleCredential('token', verifierFor(payload()))).rejects.toThrow(
      /not configured/i
    );
  });
});
