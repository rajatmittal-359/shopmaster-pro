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
  return data?.product || null;
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

export const apiBase = API;
