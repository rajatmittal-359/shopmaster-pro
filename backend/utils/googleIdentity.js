/**
 * Checking that a Google sign-in really came from Google.
 *
 * WHAT ARRIVES
 *   The browser sends one string: an ID token, which is a JWT that Google
 *   signed. It carries who the person is - `sub`, email, name - and which app
 *   it was issued for.
 *
 * WHY THE LIBRARY AND NOT OUR OWN CHECK
 *   Verifying it means fetching Google's public keys, matching the one named in
 *   the header, checking the signature, and then checking the claims - and
 *   handling key rotation without a stale cache. Written by hand, one mistake
 *   in that chain is not a bug, it is an authentication bypass: a forged token
 *   signs somebody in as anybody. Google's own library does exactly this, and
 *   using it is what their documentation tells you to do.
 *
 * WHAT IS CHECKED, AND WHY EACH ONE MATTERS
 *   - the signature: proves Google issued it
 *   - `aud` equals OUR client id: a valid Google token issued to a DIFFERENT
 *     app is still a valid Google token. Without this check, anyone who can get
 *     a token for their own app can sign in here as that user. verifyIdToken
 *     does this when given `audience`, and it is the single most important
 *     line in this file
 *   - `iss` is Google: belt and braces; the library checks it too
 *   - `email_verified`: Google will hand out a token for an unverified address,
 *     and we LINK accounts by email. Accepting an unverified one would let
 *     somebody claim an address they do not own and walk into that account
 */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

/** Lazily required so the whole app does not fail to boot without the package. */
let cachedClient = null;
const clientFor = () => {
  if (cachedClient) return cachedClient;

  // eslint-disable-next-line global-require
  const { OAuth2Client } = require('google-auth-library');
  cachedClient = new OAuth2Client(CLIENT_ID);
  return cachedClient;
};

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/**
 * @param {string} credential  the ID token the browser was given
 * @param {object} [deps]      `verify` is replaceable so tests never call Google
 * @returns {Promise<{googleId: string, email: string, name: string}>}
 * @throws  with a message safe to show, on anything that does not check out
 */
async function verifyGoogleCredential(credential, deps = {}) {
  if (!CLIENT_ID) {
    // Fail loudly rather than skipping the audience check.
    throw new Error('Google sign-in is not configured on this server');
  }
  if (!credential || typeof credential !== 'string') {
    throw new Error('No Google credential was sent');
  }

  const verify =
    deps.verify ||
    (async (token) => {
      const ticket = await clientFor().verifyIdToken({
        idToken: token,
        audience: CLIENT_ID,
      });
      return ticket.getPayload();
    });

  let payload;
  try {
    payload = await verify(credential);
  } catch (err) {
    /*
     * The library's own messages are written for a developer and some of them
     * QUOTE THE TOKEN BACK - "Wrong number of segments in token: <token>".
     * That message goes to the browser as a 401, so it would put a credential
     * into a screen, a screenshot and any support email that follows. The real
     * one is logged; the person gets a sentence.
     */
    console.error('GOOGLE TOKEN REJECTED:', err.message);
    throw new Error('That Google sign-in could not be verified. Please try again.');
  }

  if (!payload) throw new Error('That Google sign-in could not be verified');

  if (!GOOGLE_ISSUERS.includes(payload.iss)) {
    throw new Error('That token did not come from Google');
  }

  /*
   * Checked again here even though the library was given `audience`. It is one
   * line, and it is the difference between "signed in as themselves" and
   * "signed in as anybody whose token somebody else obtained".
   */
  if (payload.aud !== CLIENT_ID) {
    throw new Error('That Google sign-in was issued for a different app');
  }

  if (!payload.email || payload.email_verified !== true) {
    throw new Error(
      'That Google account has no verified email address, so we cannot match it to an account'
    );
  }

  if (!payload.sub) throw new Error('That Google sign-in is missing its account id');

  return {
    googleId: payload.sub,
    email: String(payload.email).toLowerCase(),
    // Google does not always send a name; the email's local part is a better
    // fallback than an empty string on an order.
    name: payload.name || payload.given_name || String(payload.email).split('@')[0],
  };
}

module.exports = { verifyGoogleCredential, GOOGLE_ISSUERS };
