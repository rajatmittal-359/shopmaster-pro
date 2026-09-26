'use client';

import { useEffect } from 'react';
import { apiBase } from '@/lib/api';

/**
 * Tells the API that this product page was opened, once per render.
 *
 * WHY IT IS HERE AND NOT ON THE SERVER (27 Sep 2026)
 *   The seller's report page shows "page opened" for each listing. The first
 *   attempt counted inside the API's getProduct, which is wrong by a factor
 *   of however many people see one cached page: `lib/api.js` fetches the
 *   product through Next's cached fetch, so the API is reached once per
 *   revalidate window for the whole world. A hundred shoppers read as one.
 *
 *   Counting here is one small request from the browser that actually looked
 *   at the page - which is also how it stops counting crawlers, since most of
 *   them never run this.
 *
 * It answers 204 whatever happens and nothing on the page depends on it, so a
 * blocked request, an ad blocker or an offline phone costs a count and
 * nothing else.
 */
/*
 * One page load is one count, even when the effect runs twice - React's
 * StrictMode does exactly that in development, and a seller comparing the
 * number here against what they can see on the live site must not find it
 * doubled. Module scope, so it survives a remount and dies with the page.
 */
const pinged = new Set();

export default function ViewPing({ productId }) {
  useEffect(() => {
    if (!productId || pinged.has(productId)) return;
    pinged.add(productId);
    // Mounted at /api/public/products (app.js), not /api/products.
    fetch(`${apiBase}/public/products/${productId}/view`, {
      method: 'POST',
      // The cookie so a seller's own look at their own listing is not
      // counted; X-Requested-With because the API refuses cookie-carrying
      // writes without it (lib/client).
      credentials: 'include',
      headers: { 'X-Requested-With': 'fetch' },
      keepalive: true,
    }).catch(() => {});
  }, [productId]);

  return null;
}
