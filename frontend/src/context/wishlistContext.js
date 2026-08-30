import { createContext, useContext } from 'react';

/**
 * The wishlist context and its hook, kept apart from the provider component so
 * Vite's fast refresh keeps working (a file may export components or plain
 * values, not both).
 */
export const WishlistContext = createContext(null);

/** The set of wishlisted products, and how to change it. */
export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used inside <WishlistProvider>');
  }
  return context;
}
