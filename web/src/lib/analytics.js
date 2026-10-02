/**
 * GA4 and the Meta Pixel, the honest way: one call site, silent without an ID.
 *
 * WHY EVENTS AND NOT JUST PAGE VIEWS
 *   Page views say people came. The four ecommerce events below say where
 *   they stopped: viewed a product, put it in the cart, started paying,
 *   paid. GA4's own funnel report reads exactly these names and shapes
 *   (Google's "Measure ecommerce" reference), so nothing has to be built to
 *   see the funnel - it appears in Reports > Monetisation the day the ID is
 *   set.
 *
 * WHY THE SAME FOUR GO TO META (19 Sep 2026)
 *   Meta's ads only get cheap once the pixel has seen enough of these: the
 *   standard events ViewContent / AddToCart / InitiateCheckout / Purchase
 *   are what "retarget the people who looked", lookalike audiences and the
 *   catalog's dynamic ads are built on. Sending them from day one means the
 *   audience exists the day the first ad is ever bought - and nothing is
 *   bought until then. Purchase carries an eventID (the order's id) so the
 *   server-side copy (backend utils/metaCapi) is counted once, not twice.
 *
 * WHAT IT NEVER DOES
 *   Throw, block, or run without consent or an ID. `NEXT_PUBLIC_GA_MEASUREMENT_ID`
 *   / `NEXT_PUBLIC_META_PIXEL_ID` empty means every call is a no-op -
 *   localhost, previews and a fresh clone send nothing anywhere. The pixel
 *   is only loaded after "Accept all" (components/common/ConsentBanner), so
 *   `window.fbq` simply does not exist for a visitor who said no.
 */
export const GA_ID = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim();
// .trim(): a CI variable left as a single space (GitHub refuses an empty one) must still mean "off".
export const PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID || '').trim();

/**
 * The shop's own traffic, labelled rather than thrown away.
 *
 * WHY (2 Oct 2026)
 *   GA4 was reading 183 sessions a month, 65% of them Direct, averaging **24
 *   events and nearly five minutes** each - and the single most-viewed page on
 *   the whole site was "Products · Seller · ShopMaster Pro". No shopper behaves
 *   like that. It was the shop itself: Rajat and his mother working in the
 *   seller and admin panels all day, on the live site.
 *
 *   GoogleAnalytics.jsx already refused to load on localhost for exactly this
 *   reason - "a day of building pages never counts as forty visitors" - but the
 *   panels are used on PRODUCTION, where that guard does not reach.
 *
 * WHY LABELLED AND NOT DROPPED
 *   The first version of this simply did not send the event. Rajat's objection
 *   killed it, and he was right: *"bhale hi jhel lenge apna traffic, lekin pata
 *   nahi chalega ki apni site pe kaun kitna aata hai - dhokha nahi hona
 *   chahiye."* A dropped event is gone forever; there is no way to look at it
 *   later, and no way to check the filter is not hiding real people.
 *
 *   So the event still goes to GA4, carrying `traffic_type: 'internal'`. The
 *   property already has a data filter on that exact parameter - *exclude events
 *   where traffic_type matches internal* - so the reports stay honest, and
 *   switching that filter off shows the shop's own usage again whenever anybody
 *   wants it. Nothing is lost; it is only sorted.
 *
 * WHY NOT GA4's IP-BASED INTERNAL FILTER
 *   Rajat asked the right question: *"kya pata kaunse device me chalenge"*. A
 *   laptop, his phone, his mother's phone, mobile data, a home connection whose
 *   IP changes - an IP list is wrong the week it is written. This is decided by
 *   the path and by who is signed in, which is true on every device, forever.
 *
 * CAREFUL WITH THE PREFIXES
 *   `/sellers` is the PUBLIC shop directory and `/sell` is the public "become a
 *   seller" page. A naive `startsWith('/seller')` would quietly mark both as
 *   internal - two real storefront pages - so each panel root is matched exactly
 *   or with its trailing slash.
 */
const PANEL_ROOTS = ['/admin', '/seller'];

export const isPanelPath = (pathname) => {
  if (typeof pathname !== 'string') return false;
  return PANEL_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
};

/**
 * Is this the shop looking at its own site?
 *
 * Two ways in, because the path alone misses the bigger half: the panels are
 * obviously internal, but Rajat and his mother also browse the STOREFRONT -
 * checking a product page, opening their own shop - and that is counted as a
 * visitor unless who is signed in is taken into account.
 */
export const isInternalTraffic = (pathname, { isSeller = false, isAdmin = false } = {}) =>
  isPanelPath(pathname) || Boolean(isSeller) || Boolean(isAdmin);

const gtag = (...args) => {
  // No gtag on localhost (GoogleAnalytics.jsx never loads it there), so this is a no-op in dev.
  if (!GA_ID || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag(...args);
  } catch {
    // Analytics must never be the reason a page misbehaves.
  }
};

/** Meta standard event; `eventId` deduplicates against the server-side copy. */
const fbq = (name, params = {}, eventId) => {
  if (!PIXEL_ID || typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  try {
    window.fbq('track', name, params, eventId ? { eventID: String(eventId) } : undefined);
  } catch {
    // Same rule: a tag never breaks a page.
  }
};

const ids = (items) => items.map((i) => String(i._id || i.productId || i.id || '')).filter(Boolean);
const count = (items) => items.reduce((n, i) => n + (Number(i.quantity) || 1), 0);

export const track = (event, params = {}) => gtag('event', event, params);

/** A GA4 item, from whatever shape of product the caller has. */
export const gaItem = (p, quantity = 1) => ({
  item_id: String(p._id || p.productId || p.id || ''),
  item_name: p.name,
  item_brand: p.shop?.name || p.brand || undefined,
  item_category: p.category?.name || undefined,
  price: Number(p.salePrice ?? p.price) || undefined,
  quantity,
});

export const viewItem = (product, price) =>
  track('view_item', { currency: 'INR', value: Number(price ?? product.price) || 0, items: [gaItem(product)] });

export const addToCart = (product, quantity, price) =>
  track('add_to_cart', {
    currency: 'INR',
    value: (Number(price ?? product.price) || 0) * quantity,
    items: [gaItem(product, quantity)],
  });

export const beginCheckout = (items, value) =>
  track('begin_checkout', { currency: 'INR', value: Number(value) || 0, items: items.map((i) => gaItem(i, i.quantity)) });

export const purchase = ({ orderId, value, shipping, coupon, items }) =>
  track('purchase', {
    transaction_id: String(orderId),
    currency: 'INR',
    value: Number(value) || 0,
    shipping: Number(shipping) || 0,
    coupon: coupon || undefined,
    items: (items || []).map((i) => gaItem(i, i.quantity)),
  });

export const search = (term, results) => track('search', { search_term: term, ...(results === undefined ? {} : { results }) });
