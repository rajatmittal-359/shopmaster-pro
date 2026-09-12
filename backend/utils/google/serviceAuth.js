const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * A Google access token for the backend's own identity - no user, no
 * consent screen, no library.
 *
 * WHY A SERVICE ACCOUNT
 *   Search Console and Merchant Center data belong to the shop, not to
 *   whoever is logged into the panel. The backend reads them as itself:
 *   `shopmaster-backend@…iam.gserviceaccount.com`, added as a user in both
 *   consoles by Rajat on 12 Sep 2026. Locally the key is a file under
 *   `private/` (gitignored); on Render it is the JSON in an env var.
 *
 * HOW
 *   The standard JWT bearer flow: sign a one-hour claim set with the key
 *   (RS256, Node's crypto - no npm), swap it at the token endpoint, cache the
 *   token until a minute before it expires. One token per scope set.
 */
const SCOPES = {
  searchConsole: 'https://www.googleapis.com/auth/webmasters.readonly',
  merchant: 'https://www.googleapis.com/auth/content',
  analytics: 'https://www.googleapis.com/auth/analytics.readonly',
};

let credentials = null;
const cache = new Map(); // scope -> { token, expiresAt }

const loadCredentials = () => {
  if (credentials) return credentials;
  if (process.env.GOOGLE_SA_KEY_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SA_KEY_JSON);
  } else if (process.env.GOOGLE_SA_KEY_FILE) {
    const file = path.resolve(__dirname, '../..', process.env.GOOGLE_SA_KEY_FILE);
    credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return credentials;
};

const configured = () => {
  try {
    return Boolean(loadCredentials()?.client_email);
  } catch {
    return false;
  }
};

const b64url = (input) => Buffer.from(input).toString('base64url');

const accessToken = async (scope, deps = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const hit = cache.get(scope);
  if (hit && hit.expiresAt - 60 > now) return hit.token;

  const creds = loadCredentials();
  if (!creds?.client_email || !creds?.private_key) {
    throw new Error('Google service account is not configured (GOOGLE_SA_KEY_FILE or GOOGLE_SA_KEY_JSON)');
  }

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: creds.client_email, scope, aud: creds.token_uri, iat: now, exp: now + 3600 })
  );
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), creds.private_key).toString('base64url');
  const assertion = `${header}.${claims}.${signature}`;

  const doFetch = deps.fetch || fetch;
  const res = await doFetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token refused: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  }
  cache.set(scope, { token: data.access_token, expiresAt: now + (data.expires_in || 3600) });
  return data.access_token;
};

module.exports = { SCOPES, accessToken, configured, _reset: () => cache.clear() };
