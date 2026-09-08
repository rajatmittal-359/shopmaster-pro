'use client';

import { usePathname } from 'next/navigation';

/**
 * Hides its children on the sign-in, sign-up and password screens.
 *
 * WHY THOSE SCREENS LOSE THE CATEGORY STRIP
 *   Amazon, Myntra and Meesho all strip the catalogue navigation from their
 *   sign-in screens, and they are right to: a screen with one job should not
 *   offer eleven ways to abandon it. Somebody who was asked to sign in was
 *   already on their way somewhere, and every category link is an invitation to
 *   forget where.
 *
 *   The header itself STAYS. The logo, the cart and the way back are how
 *   somebody who landed here by accident gets out, and hiding those would be
 *   a trap rather than a focused screen.
 *
 * WHY THIS IS A CLIENT COMPONENT WRAPPING SERVER-RENDERED CHILDREN
 *   The strip is server-rendered - the category links are in the HTML Google
 *   reads, and that must not change. Passing it in as `children` keeps it that
 *   way; only the decision to show it happens here. `usePathname` runs during
 *   the server render too, so there is no flash of a bar that then vanishes.
 */
const HIDDEN_ON = ['/login', '/register', '/forgot-password', '/reset-password'];

export default function HideOnAuthPages({ children }) {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;
  return children;
}
