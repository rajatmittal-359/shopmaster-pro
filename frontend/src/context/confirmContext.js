import { createContext, useContext } from 'react';

/**
 * The confirm context and its hook, kept apart from the provider component so
 * Vite's fast refresh keeps working.
 */
export const ConfirmContext = createContext(null);

/**
 * Asks the customer to confirm something before it happens.
 *
 * Returns a promise resolving true or false, so it reads like the browser's
 * own confirm and drops into the same place in a handler:
 *
 *     const confirm = useConfirm();
 *     if (!(await confirm({ title: 'Delete this address?' }))) return;
 */
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return context;
}
