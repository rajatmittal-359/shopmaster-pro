/**
 * A shop's short link: www.shopmasterpro.in/charming-jewels
 *
 * WHY (27 Sep 2026)
 *   The shop URL was `/sellers/6a93cf88fbb4f39f4a6d5618`. That id was about
 *   to be pasted into a WhatsApp Business profile, a Google Business Profile,
 *   an Instagram bio and onto parcel slips. Nobody types a 24-character hex
 *   string, and it makes a small shop look like a database row.
 *
 * THE RESERVED LIST IS THE WHOLE RISK
 *   The link lives at the ROOT, so a shop's slug and a page of the site share
 *   one namespace. Next.js gives a static route priority over a dynamic one,
 *   so a shop called "Cart" would not actually break /cart - it would simply
 *   be unreachable, which is worse: the seller sees a slug saved in Settings
 *   and a link that goes somewhere else entirely. So those names are refused
 *   at the point they are minted, and the list includes room for pages we
 *   have not built yet.
 */

/**
 * Every root path the site owns, plus the ones it might. A slug may never be
 * one of these. Kept deliberately generous - a shop losing "blog" as a slug
 * costs it nothing; the site losing /blog costs a rebuild.
 */
const RESERVED = new Set([
  // real routes today
  'account', 'addresses', 'admin', 'api', 'cart', 'checkout', 'coupons', 'help',
  'login', 'orders', 'products', 'register', 'reviews', 'sell', 'seller', 'sellers',
  'shop', 'wishlist', 'forgot-password', 'reset-password',
  // policy pages
  'about', 'contact', 'privacy', 'terms', 'returns', 'shipping', 'refunds',
  'how-we-rank', 'grievance', 'cookies', 'security',
  // files and conventions a browser or crawler may ask for
  'robots', 'sitemap', 'favicon', 'manifest', 'opensearch', 'ads', 'well-known',
  'static', '_next', 'assets', 'images', 'img', 'css', 'js', 'fonts',
  // room for later
  'blog', 'press', 'careers', 'jobs', 'app', 'download', 'pricing', 'partners',
  'affiliate', 'gift-cards', 'track', 'search', 'categories', 'category',
  'new', 'sale', 'offers', 'deals', 'brands', 'stores', 'store', 'shops',
]);

/** Only these can appear in a slug, and only in this shape. */
const SHAPE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/**
 * "Charming Jewels" -> "charming-jewels". Devanagari and anything else
 * non-ASCII drops out, which is why `slugify` can legitimately return '' and
 * every caller has to cope with that rather than assume a name makes a slug.
 */
const slugify = (name) =>
  String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

/** Is this something a shop may be called? Shape and namespace, not taste. */
const isUsable = (slug) => SHAPE.test(slug) && !RESERVED.has(slug);

/**
 * A slug for this shop that nobody else holds.
 *
 * Collisions get `-2`, `-3`, and so on rather than a random suffix: two
 * shops genuinely called "Krishna Jewellers" should read as what they are,
 * and a seller can always set something better by hand later.
 *
 * Returns null when the name yields nothing usable - a shop named only in
 * Devanagari, or one that slugifies to a reserved word. The caller keeps the
 * id URL, which has always worked and still does.
 */
const uniqueSlug = async (Seller, name, ownId = null) => {
  const base = slugify(name);
  if (!base || !SHAPE.test(base)) return null;

  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!isUsable(candidate)) continue;
    const clash = await Seller.findOne({ slug: candidate }).select('_id').lean();
    if (!clash || (ownId && String(clash._id) === String(ownId))) return candidate;
  }
  return null;
};

module.exports = { slugify, isUsable, uniqueSlug, RESERVED, SHAPE };
