'use client';

import { usePathname } from 'next/navigation';

/**
 * Shows the storefront's chrome - header, category strip, footer - only on
 * storefront routes.
 *
 * WHY
 *   The seller and admin panels had the shop's header, the category strip and
 *   the shop's footer stacked on top of their own sidebar. Rajat's words:
 *   "aadha customer jaisa, aadha seller - sab bakwaas." He was right, and no
 *   reference does it: Shopify's admin, Amazon Seller Central and Meesho's
 *   supplier panel are separate applications with their own slim top bar.
 *   A person running a shop is not shopping, and the categories, the search
 *   box and "Sell on ShopMaster Pro" are noise in that moment.
 *
 * WHY A CLIENT GATE AND NOT ROUTE GROUPS
 *   Next cannot remove a parent layout from a child route, and moving every
 *   storefront page under a `(shop)` group would touch thirty files for the
 *   same result. This wraps the chrome in one component that reads the path;
 *   the chrome itself stays server-rendered (it is passed in as children),
 *   and `usePathname` runs during the server render too, so there is no flash.
 *
 * The panels bring their own top bar - see PanelShell.
 */
const PANEL_PREFIXES = ['/seller', '/admin'];

export default function ShopChrome({ children }) {
  const pathname = usePathname() || '/';
  const inPanel = PANEL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (inPanel) return null;
  return children;
}
