/**
 * Talking to the API from the server.
 *
 * WHY EVERY CALL IS HERE AND NOT IN THE PAGES
 *   Each one carries a cache lifetime, and that lifetime is a decision about
 *   how stale a price may be. Scattered through the pages those decisions get
 *   copied without their reasons; here they are visible next to each other.
 *
 * WHY IT NEVER THROWS AT THE PAGE
 *   A page that throws on a 404 renders an error where a "not found" belongs.
 *   These return null instead, and the page decides - which for a product means
 *   calling notFound() BEFORE it returns any JSX, so Next can still send a real
 *   404 status rather than a soft one.
 */
const API = process.env.NEXT_PUBLIC_API_URL || 'https://shopmaster-api-sg.onrender.com/api';

/**
 * Five minutes.
 *
 * The catalogue is read on every page load and changes rarely, so this removes
 * a round trip to Singapore from most visits. It is also the outer limit of how
 * wrong a price may be on screen - and the server, not the page, decides what
 * is actually charged, so a stale figure cannot become a wrong charge.
 */
const CATALOGUE_TTL = 300;

const get = async (path, { revalidate = CATALOGUE_TTL } = {}) => {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate } });
    /*
     * 404 is an ANSWER, not a failure: the API sends it for a category slug
     * that does not exist. Collapsing it into null would make the page show
     * "could not load" for something that simply is not there - and a listing
     * that answers 200 with an empty grid is a soft 404 Google indexes.
     */
    if (res.status === 404) return { __notFound: true };
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    // A page half-rendered with a missing block beats a 500. The caller decides
    // what to show; this only refuses to crash the render.
    console.error(`API ${path} failed:`, err.message);
    return null;
  }
};

/** One product, by slug or by the old ObjectId - the API accepts both. */
export const getProduct = async (slug) => {
  const data = await get(`/public/products/${encodeURIComponent(slug)}`);
  if (!data?.product) return null; // __notFound has no .product either

  /*
   * The sibling sizes travel with the product because the page needs them in
   * the same render - fetching them separately would mean the size picker
   * appearing a moment after the price, which is exactly the sort of shift
   * that gets counted against the page.
   */
  return { ...data.product, variants: data.variants || [] };
};

/** The reviews shown on a product page. */
export const getReviews = async (productId) => {
  const data = await get(`/reviews/product/${productId}`);
  // The endpoint has been through two shapes; accept both rather than break.
  return data?.reviews || (Array.isArray(data) ? data : []);
};

/**
 * More from the same category, minus this one.
 *
 * Asks for one extra and drops the current product client-side: filtering by id
 * in the query would need an endpoint change, and this costs one row.
 */
export const getRelated = async (categorySlug, excludeId, limit = 4) => {
  if (!categorySlug) return [];
  const data = await get(
    `/public/products?category=${encodeURIComponent(categorySlug)}&limit=${limit + 1}`
  );
  return (data?.products || []).filter((p) => p._id !== excludeId).slice(0, limit);
};

/**
 * The listing. `params` is whatever the URL carried, minus anything empty -
 * an empty `?color=` in the query string would otherwise be sent to the API as
 * a filter for products whose colour is the empty string.
 */
export const getProducts = async (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const data = await get(`/public/products?${qs}`);
  if (data?.__notFound) return { notFound: true };
  return data;
};

/** The colours and price range that genuinely exist inside the current view. */
export const getFilters = async (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return (await get(`/public/products/filters?${qs}`)) || { colors: [], price: null };
};

/**
 * The category tree, with a live product count on every node.
 *
 * Cached for an hour rather than five minutes: categories are created by hand
 * a few times a year, and this is fetched on every listing page.
 */
export const getCategories = async () => {
  const data = await get('/public/products/categories/tree', { revalidate: 3600 });
  return data?.categories || data?.tree || [];
};

/**
 * A seller's public page.
 *
 * Cached like the catalogue: it is the same answer for everybody, and a shop's
 * name and rating do not change by the minute.
 */
export const getSeller = async (userId) => {
  const data = await get(`/public/sellers/${encodeURIComponent(userId)}`);
  if (!data || data.__notFound) return null;
  return data;
};

export const apiBase = API;
