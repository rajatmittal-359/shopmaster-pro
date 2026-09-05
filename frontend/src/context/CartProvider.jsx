import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
} from '../services/cartService';
import { useAuth } from './authContext';
import { CartContext } from './cartContext';

/**
 * What this customer has in their cart.
 *
 * THE PROBLEM THIS SOLVES
 *   There was no shared cart state at all - the wishlist had this, the cart
 *   never got it - and three things followed from that one gap:
 *
 *   The cart icon could not show a count, because nothing knew one.
 *
 *   Every ProductCard kept its own `useState(false)` for "is this in the
 *   cart", initialised from nothing. Reload the shop with a full cart and
 *   every card claimed the product was not in it. Press Add again and the
 *   server COMPOUNDS the quantity (existing + 1), so it silently climbed to
 *   two, three, four while the card showed no sign of it.
 *
 *   A quantity stepper on a card was impossible, because a card had no
 *   quantity to step.
 *
 * WHY A MAP RATHER THAN A SET
 *   The wishlist stores a Set: a card only ever asks "is it in?". A cart card
 *   asks "how many?", so this keeps id → quantity, which is what the stepper
 *   renders and what the badge sums.
 */
export function CartProvider({ children }) {
  const { token, role } = useAuth();
  const isCustomer = Boolean(token) && role === 'customer';

  const [items, setItems] = useState(() => new Map());
  const [loaded, setLoaded] = useState(false);

  /**
   * The first read, as a promise, and the latest quantities, as a ref.
   *
   * A press can land before that read comes back - the shop paints long
   * before the cart does - and setQuantity has to know whether the product is
   * already in the cart to choose between POST (which ADDS) and PATCH (which
   * sets). Deciding that from state which has not arrived yet answers "not in
   * the cart" for everything, and POSTs onto an existing line: the compounding
   * bug again, narrowed to the first second of the page. So a press waits for
   * the read instead of guessing, and reads the quantities from a ref, which
   * that wait would otherwise leave stale in the closure.
   */
  const readyRef = useRef(null);
  const itemsRef = useRef(items);

  /**
   * Writes both, so the ref is never behind the state. Every change goes
   * through here rather than setItems - a ref cannot be synced during render.
   */
  const writeItems = useCallback((next) => {
    const value = typeof next === 'function' ? next(itemsRef.current) : next;
    itemsRef.current = value;
    setItems(value);
  }, []);

  const readCart = useCallback(async () => {
    const { data } = await getCart();
    const lines = data.cart?.items || [];
    return new Map(
      lines.map((i) => [String(i.productId?._id || i.productId), i.quantity])
    );
  }, []);

  // One fetch per signed-in customer. The signed-out case is DERIVED rather
  // than stored: quantityOf answers 0 when nobody is signed in.
  useEffect(() => {
    if (!isCustomer) return undefined;

    let cancelled = false;
    readyRef.current = (async () => {
      try {
        const next = await readCart();
        if (!cancelled) writeItems(next);
      } catch {
        /* an expired session is handled by the response interceptor */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCustomer, readCart, writeItems]);

  const quantityOf = useCallback(
    (productId) => (isCustomer ? items.get(String(productId)) || 0 : 0),
    [isCustomer, items]
  );

  /** Units in the cart, which is what a badge on a cart icon means. */
  const count = useMemo(
    () => (isCustomer ? [...items.values()].reduce((n, q) => n + q, 0) : 0),
    [isCustomer, items]
  );

  /**
   * Set a product's quantity outright. 0 removes it.
   *
   * Absolute, never relative: POST /cart ADDS to what is already there, so
   * sending "1" twice leaves two. Only the first add uses POST; every change
   * after that is a PATCH with the number the customer should end up with.
   *
   * The change is applied before the request so the stepper responds at once,
   * and rolled back if the server refuses - a cart that lies about what is in
   * it is worse than a slow one.
   */
  const setQuantity = useCallback(
    async (productId, quantity) => {
      // Never act on a cart that has not been read yet - see readyRef.
      if (readyRef.current) await readyRef.current;

      const id = String(productId);
      const previous = itemsRef.current.get(id) || 0;
      const next = Math.max(0, quantity);
      if (next === previous) return { ok: true };

      writeItems((current) => {
        const draft = new Map(current);
        if (next === 0) draft.delete(id);
        else draft.set(id, next);
        return draft;
      });

      try {
        if (next === 0) await removeFromCart(id);
        else if (previous === 0) await addToCart({ productId: id, quantity: next });
        else await updateCartItem({ productId: id, quantity: next });
        return { ok: true };
      } catch (err) {
        // Re-read rather than guess: the server refuses for reasons the client
        // cannot predict, stock running out being the usual one.
        try {
          writeItems(await readCart());
        } catch {
          writeItems((current) => {
            const draft = new Map(current);
            if (previous === 0) draft.delete(id);
            else draft.set(id, previous);
            return draft;
          });
        }
        return {
          ok: false,
          message: err?.response?.data?.message || 'Could not update your cart',
        };
      }
    },
    [readCart, writeItems]
  );

  /** Puts one in the cart. Used by the shop card's first press. */
  const add = useCallback((productId) => setQuantity(productId, 1), [setQuantity]);

  /** After checkout, or after the cart page empties it. */
  const refresh = useCallback(async () => {
    if (!isCustomer) return;
    try {
      writeItems(await readCart());
    } catch {
      /* nothing useful to do here */
    }
  }, [isCustomer, readCart, writeItems]);

  const value = useMemo(
    () => ({
      loaded: isCustomer && loaded,
      isCustomer,
      count,
      quantityOf,
      setQuantity,
      add,
      refresh,
    }),
    [isCustomer, loaded, count, quantityOf, setQuantity, add, refresh]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
