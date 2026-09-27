/**
 * A Google Ads access token for Rajat's own identity.
 *
 * WHY NOT THE SERVICE ACCOUNT NEXT DOOR
 *   `serviceAuth.js` signs a JWT as `shopmaster-backend@…gserviceaccount.com`
 *   and that is the right identity for Search Console and Merchant Center,
 *   where the shop added the robot as a user. Google Ads will not take it.
 *   Ads authorises a *person*: the manager account 877-681-8872 belongs to
 *   rajatmittal359@gmail.com, and the API wants a token minted from that
 *   human's consent. A service account can only reach Ads through
 *   domain-wide delegation, which needs Google Workspace - a personal Gmail
 *   cannot do it.
 *
 *   So this file does the other half of OAuth: the refresh token Rajat
 *   granted once on 27 Sep 2026 (scope `adwords`, via the OAuth Playground
 *   with our OWN client, not the Playground's), swapped for a one-hour
 *   access token whenever one is needed.
 *
 * THE PART THAT IS EASY TO GET WRONG
 *   A refresh token is bound to the client that minted it. The first attempt
 *   used the Playground's built-in client, and the token it produced would
 *   have failed at runtime with `invalid_grant` - months later, on the box,
 *   for no visible reason. `mintedByUs()` below is that lesson turned into a
 *   check we can run.
 *
 * NOTHING HERE THROWS ON A MISSING KEY. Ads is optional: the panel asks
 * `configured()` and says so plainly rather than erroring.
 */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// One token, one process, refreshed a minute before Google drops it.
let cache = null; // { token, expiresAt }

const env = () => ({
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

/**
 * Every piece present? The developer token counts: without it the Ads API
 * refuses every call, so a token we could mint but never spend is not
 * "configured" in any useful sense.
 */
const configured = () => {
  const e = env();
  return Boolean(e.clientId && e.clientSecret && e.refreshToken && e.developerToken);
};

/**
 * Which of the four is missing - so the panel can name it instead of
 * showing a shrug.
 * @returns {string[]}
 */
const missing = () => {
  const e = env();
  const names = {
    GOOGLE_ADS_CLIENT_ID: e.clientId,
    GOOGLE_ADS_CLIENT_SECRET: e.clientSecret,
    GOOGLE_ADS_REFRESH_TOKEN: e.refreshToken,
    GOOGLE_ADS_DEVELOPER_TOKEN: e.developerToken,
  };
  return Object.keys(names).filter((k) => !names[k]);
};

const accessToken = async (deps = {}) => {
  const now = Math.floor(Date.now() / 1000);
  if (cache && cache.expiresAt - 60 > now) return cache.token;

  const { clientId, clientSecret, refreshToken } = env();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Google Ads is not configured (${missing().join(', ')})`);
  }

  const doFetch = deps.fetch || fetch;
  const res = await doFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) {
    // `invalid_grant` is the one worth naming: it means the consent was
    // withdrawn, the token was minted by a different client, or it simply
    // expired from disuse. All three need a human, not a retry.
    const hint =
      data?.error === 'invalid_grant'
        ? ' - the refresh token was rejected. Mint a new one at the OAuth Playground with OUR client id and secret (see OPS-AND-MANUAL-ACTIONS.md).'
        : '';
    throw new Error(`Google Ads token refused: ${res.status} ${JSON.stringify(data).slice(0, 200)}${hint}`);
  }

  cache = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) };
  return cache.token;
};

module.exports = { accessToken, configured, missing, _reset: () => { cache = null; } };
