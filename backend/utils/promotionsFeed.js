/**
 * The promotions feed - live coupons, in the shape Merchant Center reads.
 *
 * WHY A FEED AND NOT THE API
 *   Same reason as the product feed: Google fetches a URL once a day, there
 *   is nothing to schedule and no token to keep alive, and a coupon created
 *   in the admin panel is on Google by the next fetch and gone the day it
 *   expires. The "Add promotions from a file" screen in Merchant Center
 *   takes this URL; the format is Google's promotions feed spec
 *   (support.google.com/merchants/answer/2906014): TSV, one row per
 *   promotion, seven required columns plus the structured discount ones.
 *
 * WHAT GOES IN
 *   Active coupons that a Shopping visitor can actually use: valid now or in
 *   the future, not exhausted, and either platform-funded (every product) or
 *   funded by a seller whose products are in the product feed. A coupon that
 *   a stranger cannot redeem is a promotion Google will disapprove.
 *
 * WHAT DOES NOT
 *   Expired or inactive coupons, and ones already used up - Google checks
 *   the code on the site and a dead code costs the account's standing.
 */
const IST = '+05:30';
const MAX_TITLE = 60;

/** Google wants YYYY-MM-DDTHH:MM:SS±HH:MM/… with an explicit zone. */
const istStamp = (d) => {
  const t = new Date(new Date(d).getTime() + 5.5 * 3600000); // shift to IST wall clock
  return t.toISOString().replace(/\.\d{3}Z$/, '') + IST;
};

const title = (c) => {
  const what = c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`;
  const min = c.minOrderValue > 0 ? ` on orders over ₹${c.minOrderValue}` : '';
  const cap = c.type === 'percent' && c.maxDiscount ? ` (up to ₹${c.maxDiscount})` : '';
  return `${what}${min}${cap} with code ${c.code}`.slice(0, MAX_TITLE);
};

/**
 * Coupons a shopper arriving from Google could redeem right now or soon.
 * @param {Array} coupons  lean Coupon docs
 * @param {{now?: Date, sellerIds?: Set<string>}} opts  sellerIds = sellers whose products are in the product feed
 */
const eligible = (coupons, { now = new Date(), sellerIds } = {}) =>
  coupons.filter((c) => {
    if (!c.isActive) return false;
    if (c.validUntil && new Date(c.validUntil) < now) return false;
    if (c.usageLimit && c.usedCount >= c.usageLimit) return false;
    if (c.fundedBy === 'seller' && sellerIds && !sellerIds.has(String(c.sellerId))) return false;
    return true;
  });

const COLUMNS = [
  'promotion_id',
  'product_applicability',
  'offer_type',
  'generic_redemption_code',
  'long_title',
  'promotion_effective_dates',
  'redemption_channel',
  'promotion_destination',
  'coupon_value_type',
  'percent_off',
  'money_off_amount',
  'minimum_purchase_amount',
];

const row = (c, { now = new Date() } = {}) => {
  const from = c.validFrom && new Date(c.validFrom) > now ? c.validFrom : now;
  // No end date on the coupon: Google requires one, so promise six months and
  // let the next fetch extend it.
  const to = c.validUntil || new Date(new Date(from).getTime() + 183 * 86400000);
  return [
    `smp_${String(c.code).toLowerCase()}`.slice(0, 50),
    'all_products',
    'generic_code',
    c.code,
    title(c),
    `${istStamp(from)}/${istStamp(to)}`,
    'online',
    'free_listings',
    c.type === 'percent' ? 'percent_off' : 'money_off',
    c.type === 'percent' ? String(c.value) : '',
    c.type === 'flat' ? `${Number(c.value).toFixed(2)} INR` : '',
    c.minOrderValue > 0 ? `${Number(c.minOrderValue).toFixed(2)} INR` : '',
  ];
};

/** Tab-separated text: a header, then one line per coupon. */
const tsv = (coupons, opts) => [COLUMNS, ...coupons.map((c) => row(c, opts))].map((r) => r.map((v) => String(v ?? '').replace(/[\t\n\r]/g, ' ')).join('\t')).join('\n') + '\n';

module.exports = { eligible, row, tsv, title, istStamp, COLUMNS };
