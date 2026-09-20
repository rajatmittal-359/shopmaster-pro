'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';

/**
 * The two numbers on the header: pieces in the cart, items saved (21 Sep 2026;
 * Rajat: "cart ke product count and wishlist count jaisa kuch nahi").
 *
 * Flipkart and Myntra both badge the bag and the heart; without the number a
 * shopper who tapped "Add to cart" has no proof it went anywhere. One cheap
 * call (/customer/counts) after paint, again whenever the tab comes back, and
 * whenever any page writes to the cart or the list (client.js fires
 * `smp:counts` after those requests). Signed-out and admin accounts get zeros
 * without a request - the API would only refuse.
 */
export function useCounts() {
  const { signedIn, capabilities } = useSession();
  const shopper = signedIn && capabilities?.customer !== false;
  const [counts, setCounts] = useState({ cart: 0, wishlist: 0 });

  const refresh = useCallback(() => {
    if (!shopper) return;
    authedFetch('/customer/counts')
      .then((d) => setCounts({ cart: Number(d.cart) || 0, wishlist: Number(d.wishlist) || 0 }))
      .catch(() => {});
  }, [shopper]);

  useEffect(() => {
    if (!shopper) return undefined;
    const first = setTimeout(refresh, 300);
    window.addEventListener('focus', refresh);
    window.addEventListener('smp:counts', refresh);
    return () => {
      clearTimeout(first);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('smp:counts', refresh);
    };
  }, [shopper, refresh]);

  return shopper ? counts : { cart: 0, wishlist: 0 };
}
