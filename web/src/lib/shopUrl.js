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
/** The refinements that belong to one place and not the next. */
const REFINEMENTS = ['color', 'size', 'minRating', 'minPrice', 'maxPrice'];

export const shopHref = (current = {}, changes = {}) => {
  const merged = { ...current, ...changes };

  if (!('page' in changes)) delete merged.page;

  /*
   * CHANGING THE CATEGORY IS GOING SOMEWHERE ELSE, NOT NARROWING HERE.
   * Amazon drops every refinement when the department changes; Flipkart
   * drops the ones that belong to a category. Rajat, 13 Sep: a "4 stars"
   * filter set in Men's Fashion followed him into Jewellery - "jabardasti".
   * So a category change (including "All categories") clears colour, size,
   * rating and price; the search term and the sort order, which are about
   * the shopper rather than the place, stay.
   */
  if ('category' in changes && String(changes.category || '') !== String(current.category || '')) {
    for (const key of REFINEMENTS) delete merged[key];
    for (const key of Object.keys(merged)) if (key.startsWith('attr.')) delete merged[key];
  }

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
  color: (v) => `Colour: ${String(v).split(',').join(', ')}`,
  size: (v) => `Size: ${String(v).split(',').join(', ')}`,
  minRating: (v) => `${v} stars and up`,
  minPrice: (v) => `Over ₹${Number(v).toLocaleString('en-IN')}`,
  maxPrice: (v) => `Under ₹${Number(v).toLocaleString('en-IN')}`,
};
