import { createContext, useContext } from 'react';

/**
 * The auth context object and its hook, kept apart from the provider component.
 *
 * A file that exports both a component and plain values breaks Vite's fast
 * refresh, so the provider lives alone in AuthContext.jsx and everything
 * non-component lives here.
 */
export const AuthContext = createContext(null);

/** Everything about the signed-in user. Throws outside the provider. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
