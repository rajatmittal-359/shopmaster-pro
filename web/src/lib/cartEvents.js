/**
 * One event for "something went into the bag" (E2, 22 Sep 2026).
 *
 * The product page's buttons, the card's quick add and anything later fire
 * this; the header count refreshes (`smp:counts`) and the cart drawer opens
 * with the fresh cart. Kept as a window event so a server-rendered card can
 * carry a tiny client button without the whole grid becoming client code.
 */
export const CART_ADDED = 'smp:cart-added';

export const announceAdded = (detail = {}) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CART_ADDED, { detail }));
  window.dispatchEvent(new Event('smp:counts'));
};
