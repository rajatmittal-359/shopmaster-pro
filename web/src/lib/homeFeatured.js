/**
 * The home page's featured strip, read from admin Settings → Home (19 Sep
 * 2026). Returns the /shop query to fetch, or null when there is nothing to
 * show: no title, a link that is not a /shop page, or a date that has passed
 * (the day itself still counts). Kept out of the page so the server component
 * stays pure in the linter's eyes - the clock is read here, once per request.
 */
export const featuredQuery = (home = {}, now = Date.now()) => {
  const href = home.featuredHref || '';
  if (!home.featuredTitle || !/^\/shop(\?|$)/.test(href)) return null;
  if (home.featuredUntil && new Date(home.featuredUntil).getTime() + 86400000 <= now) return null;
  return Object.fromEntries(new URLSearchParams(href.split('?')[1] || ''));
};
