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
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://shopmaster-api-sg.onrender.com/api';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/seller',
          '/cart',
          '/checkout',
          '/orders',
          '/addresses',
          '/wishlist',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
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
