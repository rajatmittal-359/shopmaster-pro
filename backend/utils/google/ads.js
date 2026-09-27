const { accessToken, configured, missing } = require('./adsAuth');

/**
 * Google Ads, read from our own code.
 *
 * WHY WE WANT THIS, GIVEN WE RUN NO ADS (27 Sep 2026)
 *   The goal is not advertising. It is the search-word coach in
 *   WHAT-IS-LEFT: today a seller types a product name and Gemini GUESSES
 *   which words buyers use. Search Console tells us what people typed
 *   before they reached US - useful, but it is silent about the phrases we
 *   have never ranked for at all, which is most of them for a young shop.
 *
 *   Keyword Planner is the only free source of "how many people in India
 *   search this each month". That turns the coach from an opinion into a
 *   number: "kundan choker - 6,600 a month; kundan necklace set - 880. Put
 *   the first one in the title." Same data Amazon and Flipkart sellers pay
 *   tools for.
 *
 * THE LIMIT, STATED HONESTLY
 *   A TEST developer token only reaches TEST accounts, which contain no
 *   real search volumes. Real numbers need BASIC access, which is an
 *   application form, not a switch. So this module is expected to answer
 *   `{ ok: false }` with Google's own words until that is granted - and the
 *   panel shows that sentence rather than pretending.
 *
 * NO CLIENT LIBRARY. `google-ads-api` pulls in gRPC and protobufs for what
 * is, over REST, a POST with three headers. `npm install` is banned on this
 * laptop anyway, and `serviceAuth.js` set the precedent next door.
 */

// v21 was already sunset when this was written; v25.2 is current (23 Sep
// 2026) and v25 runs to August 2027. Only the MAJOR version goes in the URL.
// Overridable so a sunset is an env change on the box, not a deploy.
const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const API = `https://googleads.googleapis.com/${VERSION}`;

/** Ads ids are shown as 525-586-3360 and sent as 5255863360. */
const digits = (id) => String(id || '').replace(/[^0-9]/g, '');

const customerId = () => digits(process.env.GOOGLE_ADS_CUSTOMER_ID);
const loginCustomerId = () => digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

/**
 * Every Ads call carries the same three: who we are as a developer, who we
 * are as a person, and - when reaching an account THROUGH the manager -
 * which manager to look from. Leaving `login-customer-id` off a managed
 * account is the classic cause of a bare PERMISSION_DENIED.
 */
const headers = async (deps) => {
  const token = await accessToken(deps);
  const h = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'Content-Type': 'application/json',
  };
  const manager = loginCustomerId();
  if (manager) h['login-customer-id'] = manager;
  return h;
};

/**
 * Google's errors are a nest: `error.details[].errors[].message`. The
 * top-level message is usually "Request contains an invalid argument",
 * which helps nobody. Dig for the real sentence.
 */
const reasonFrom = (data, status) => {
  const inner = data?.error?.details?.[0]?.errors?.[0];
  return inner?.message || data?.error?.message || `Google Ads said ${status}`;
};

const call = async (path, body, deps = {}) => {
  if (!configured()) {
    return { ok: false, reason: `Google Ads is not connected (${missing().join(', ')})`, rows: [] };
  }
  const doFetch = deps.fetch || fetch;
  let res;
  try {
    res = await doFetch(`${API}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: await headers(deps),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    return { ok: false, reason: err.message, rows: [] };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, reason: reasonFrom(data, res.status), rows: [] };
  return { ok: true, data };
};

/**
 * Which accounts this login can see. The cheapest possible real call - the
 * one to make first when proving the wiring works, because it needs no
 * customer id and no GAQL.
 * @returns {Promise<{ok:boolean, reason?:string, rows:string[]}>} ids, digits only
 */
const accounts = async (deps = {}) => {
  const out = await call('customers:listAccessibleCustomers', null, deps);
  if (!out.ok) return out;
  // resourceNames come back as "customers/5255863360".
  const rows = (out.data.resourceNames || []).map((n) => n.split('/').pop());
  return { ok: true, rows };
};

/**
 * Run a GAQL query against one account.
 * @param {string} query  GAQL, e.g. "SELECT campaign.name FROM campaign"
 * @param {object} [opts]
 * @param {string} [opts.account]  customer id; defaults to GOOGLE_ADS_CUSTOMER_ID
 */
const search = async (query, { account } = {}, deps = {}) => {
  const id = digits(account) || customerId();
  if (!id) return { ok: false, reason: 'No Ads account id (GOOGLE_ADS_CUSTOMER_ID)', rows: [] };
  const out = await call(`customers/${id}/googleAds:search`, { query }, deps);
  if (!out.ok) return out;
  return { ok: true, rows: out.data.results || [] };
};

/**
 * What people in India type, and how often - the reason this module exists.
 *
 * Geo and language are criterion ids, not names. India is 2356 and English
 * is 1000; Jaipur alone would be a narrower constant, but city-level volume
 * on a young catalogue is mostly zeroes, so the country is the honest unit.
 * Both are env-overridable rather than hard-coded opinions.
 *
 * @param {string[]} seeds  up to 20 phrases, e.g. ['kundan choker']
 * @returns {Promise<{ok:boolean, reason?:string, rows:Array<{keyword:string, monthly:number, competition:string}>}>}
 */
const keywordIdeas = async (seeds, { account } = {}, deps = {}) => {
  const id = digits(account) || customerId();
  if (!id) return { ok: false, reason: 'No Ads account id (GOOGLE_ADS_CUSTOMER_ID)', rows: [] };

  const phrases = (Array.isArray(seeds) ? seeds : [seeds]).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20);
  if (!phrases.length) return { ok: true, rows: [] };

  const geo = process.env.GOOGLE_ADS_GEO || '2356'; // India
  const language = process.env.GOOGLE_ADS_LANGUAGE || '1000'; // English

  const out = await call(
    `customers/${id}:generateKeywordIdeas`,
    {
      language: `languageConstants/${language}`,
      geoTargetConstants: [`geoTargetConstants/${geo}`],
      keywordPlanNetwork: 'GOOGLE_SEARCH',
      keywordSeed: { keywords: phrases },
    },
    deps
  );
  if (!out.ok) return out;

  const rows = (out.data.results || [])
    .map((r) => ({
      keyword: r.text,
      // avgMonthlySearches arrives as a string on the wire; absent means
      // "too few to report", which is a real answer and means zero to us.
      monthly: Number(r.keywordIdeaMetrics?.avgMonthlySearches || 0),
      competition: r.keywordIdeaMetrics?.competition || 'UNSPECIFIED',
    }))
    .sort((a, b) => b.monthly - a.monthly);

  return { ok: true, rows };
};

/**
 * One line for the panel and for `googleReadiness`: is Ads wired, and does
 * a real call actually come back? Answers without throwing, always.
 */
const health = async (deps = {}) => {
  if (!configured()) {
    return { connected: false, reason: `Not connected (${missing().join(', ')})` };
  }
  const out = await accounts(deps);
  if (!out.ok) return { connected: false, reason: out.reason };
  return { connected: true, accounts: out.rows, manager: loginCustomerId() || null };
};

module.exports = { accounts, search, keywordIdeas, health, digits, VERSION };
