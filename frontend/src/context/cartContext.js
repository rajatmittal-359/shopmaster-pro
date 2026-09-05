import { createContext, useContext } from 'react';

/**
 * The cart context and its hook, kept apart from the provider component so
 * Vite's fast refresh keeps working (a file may export components or plain
 * values, not both).
 */
export const CartContext = createContext(null);

/** What is in the cart, and how to change it. */
export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return context;
}
