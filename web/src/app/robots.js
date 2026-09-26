/**
 * robots.txt, generated.
 *
 * THE SITEMAP LINE IS THE POINT
 *   The sitemap is served LIVE by the API (`/api/sitemap.xml`), built from the
 *   database, because the old hand-run file went nine months stale and Google
 *   was working from six URLs out of ninety-three. Pointing at it here is what
 *   makes it findable without anybody re-submitting anything.
 *
 * WHAT IS DISALLOWED, AND WHY IT IS SHORT
 *   Only the pages that are private or personal. Everything else is meant to be
 *   found. A long disallow list on a small shop is a way to accidentally hide
 *   the catalogue - and these routes already send `noindex` in their own
 *   metadata, so this is belt and braces rather than the only guard.
 *
 * THE FACET TRAP (added 26 Sep 2026, from the box's own Caddy log)
 *   Googlebot and GPTBot were found walking combinations of the shop's colour
 *   filter - `/shop?color=Teal,Maroon,Grey,Khaki,Blue,Silver` and on and on.
 *   Six filters that each take several values is a near-infinite URL space,
 *   and the crawler will happily spend the whole crawl budget in it. Search
 *   Console says 2 pages indexed out of the catalogue; every request spent on
 *   a colour permutation is one not spent on a product.
 *
 *   The pages were already `noindex, follow` with a canonical back to the
 *   clean URL (shop/page.js), so nothing was being indexed wrongly - but
 *   noindex does not stop the CRAWL, it only stops the result. Google's own
 *   faceted-navigation guidance is to block the combinations that carry no
 *   unique value, and that is what this does.
 *
 *   Left crawlable on purpose: `category` (a real page, with its own title and
 *   its own searches) and `page` (how the crawler walks the catalogue).
 *   Blocked: the six filters, the `attr.*` facets from the category templates,
 *   `search` (never a page we want in an index), and `_rsc` - Next's own
 *   prefetch payload, which is not a page at all and which Googlebot was
 *   fetching by the hundred.
 */

/**
 * `*` and `$` are not in the original robots.txt standard, but Google and Bing
 * have supported them for years and they are the only way to express "any URL
 * carrying this query parameter".
 */
const FACET_PARAMS = [
  'color=',
  'size=',
  'minRating=',
  'minPrice=',
  'maxPrice=',
  'sort=',
  // the category templates' own facets arrive as `attr.plating=Gold Plated`,
  // so the prefix is the pattern - there is no fixed key to close with `=`
  'attr.',
  'search=',
  '_rsc=',
];
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://shopmaster-api-sg.onrender.com/api';

/**
 * A STAGING host (anything that is not shopmasterpro.in - the Vercel/Render
 * preview, 20 Sep 2026) tells every crawler to stay out. Otherwise Google
 * indexes the preview as a duplicate of the shop, and the preview's product
 * URLs compete with the real ones.
 */
const isStaging = !/(^|\.)shopmasterpro\.in$/.test(new URL(SITE).hostname);

export default function robots() {
  if (isStaging) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          /*
           * `/seller` is the seller's own dashboard. `/sellers/<id>` is a
           * PUBLIC shop page and must stay crawlable - "<shop name>
           * Jaipur" is a real search, and the page that answers it should be
           * ours. The trailing slash keeps the two apart.
           */
          '/seller/',
          '/cart',
          '/checkout',
          '/orders',
          '/addresses',
          '/wishlist',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          ...FACET_PARAMS.map((p) => `/*?*${p}`),
        ],
      },
    ],
    // Our own domain: next.config.mjs proxies it to the API, which builds it
    // live from the catalogue. A sitemap on the API's host would be a
    // cross-domain one and would need that host verified too.
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
