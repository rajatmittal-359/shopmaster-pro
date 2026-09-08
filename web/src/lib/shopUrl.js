/**
 * Every link on the listing page is this function.
 *
 * WHY IT IS SHARED
 *   The filter panel, the applied-filter chips, the sort control and the
 *   pagination all rewrite the same query string. Written separately, one of
 *   them forgets to reset the page number - and then choosing a colour on page
 *   4 lands the shopper on page 4 of a three-page result, which is an empty
 *   grid with no explanation.
 *
 * SO: CHANGING A FILTER ALWAYS RETURNS TO PAGE 1. Only an explicit `page`
 * change keeps a page number.
 */
export const shopHref = (current = {}, changes = {}) => {
  const merged = { ...current, ...changes };

  if (!('page' in changes)) delete merged.page;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  const qs = params.toString();
  return qs ? `/shop?${qs}` : '/shop';
};

/** The filters a shopper can see they have applied, in the order they read. */
export const FILTER_LABELS = {
  search: (v) => `Search: ${v}`,
  category: (v) => `Category: ${v}`,
  color: (v) => `Colour: ${v}`,
  size: (v) => `Size: ${v}`,
  minRating: (v) => `${v} stars and up`,
  minPrice: (v) => `Over ₹${Number(v).toLocaleString('en-IN')}`,
  maxPrice: (v) => `Under ₹${Number(v).toLocaleString('en-IN')}`,
};
