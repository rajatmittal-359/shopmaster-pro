/**
 * GA4, the honest way: one call site, silent without an ID.
 *
 * WHY EVENTS AND NOT JUST PAGE VIEWS
 *   Page views say people came. The four ecommerce events below say where
 *   they stopped: viewed a product, put it in the cart, started paying,
 *   paid. GA4's own funnel report reads exactly these names and shapes
 *   (Google's "Measure ecommerce" reference), so nothing has to be built to
 *   see the funnel - it appears in Reports > Monetisation the day the ID is
 *   set.
 *
 * WHAT IT NEVER DOES
 *   Throw, block, or run without consent of an ID. `NEXT_PUBLIC_GA_MEASUREMENT_ID`
 *   empty means every call is a no-op - localhost, previews and a fresh
 *   clone send nothing anywhere.
 */
export const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

const gtag = (...args) => {
  // No gtag on localhost (GoogleAnalytics.jsx never loads it there), so this is a no-op in dev.
  if (!GA_ID || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag(...args);
  } catch {
    // Analytics must never be the reason a page misbehaves.
  }
};

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
