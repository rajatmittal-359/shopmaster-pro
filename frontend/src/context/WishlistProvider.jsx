import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from '../services/wishlistService';
import { useAuth } from './authContext';
import { WishlistContext } from './wishlistContext';

/**
 * Which products this customer has hearted.
 *
 * THE PROBLEM THIS SOLVES
 *   Every ProductCard fetched the ENTIRE wishlist on mount, just to decide
 *   whether its own heart should be filled. The shop lists fifty products, so
 *   opening it fired fifty identical requests for the same data - visible in
 *   the network tab as a wall of `wishlist` calls spread over three seconds,
 *   and part of why the page took so long to settle.
 *
 *   The wishlist is one list belonging to one customer. It is fetched once,
 *   here, and every card reads from it.
 *
 * WHY THE STATE IS A SET OF IDS
 *   A card only ever asks "is this product in it?". Storing ids makes that an
 *   O(1) lookup instead of scanning an array of populated products per card,
 *   and it is what makes an instant heart toggle possible without a refetch.
 */
export function WishlistProvider({ children }) {
  const { token, role } = useAuth();
  const isCustomer = Boolean(token) && role === 'customer';

  const [ids, setIds] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);

  // One fetch per signed-in customer, not one per product card.
  //
  // The signed-out case is DERIVED rather than stored: `isWishlisted` simply
  // answers false when nobody is signed in. Clearing state in an effect on the
  // way out would be an extra render for a value that can be computed.
  useEffect(() => {
    if (!isCustomer) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await getWishlist();
        if (cancelled) return;
        const items = data.wishlist?.items || [];
        setIds(new Set(items.map((i) => String(i.productId?._id || i.productId))));
      } catch {
        /* an expired session is handled by the response interceptor */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCustomer]);

  const isWishlisted = useCallback(
    (productId) => isCustomer && ids.has(String(productId)),
    [isCustomer, ids]
  );

  /**
   * Adds or removes, updating the heart immediately.
   *
   * The change is applied before the request so the card responds at once, and
   * rolled back if the server refuses - the customer should never be left
   * looking at a heart that lies about what was saved.
   */
  const toggle = useCallback(
    async (productId) => {
      const id = String(productId);
      const wasWishlisted = ids.has(id);

      setIds((current) => {
        const next = new Set(current);
        if (wasWishlisted) next.delete(id);
        else next.add(id);
        return next;
      });

      try {
        if (wasWishlisted) await removeFromWishlist(id);
        else await addToWishlist(id);
        return { ok: true, wishlisted: !wasWishlisted };
      } catch (err) {
        setIds((current) => {
          const next = new Set(current);
          if (wasWishlisted) next.add(id);
          else next.delete(id);
          return next;
        });
        return {
          ok: false,
          message: err?.response?.data?.message || 'Could not update your wishlist',
        };
      }
    },
    [ids]
  );

  const value = useMemo(
    () => ({ loaded: isCustomer && loaded, isWishlisted, toggle, isCustomer }),
    [loaded, isWishlisted, toggle, isCustomer]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}
