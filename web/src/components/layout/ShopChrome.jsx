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

/*
 * A DOCUMENT, NOT A PAGE (4 Oct 2026).
 *
 * The invoice is printed, filed, and sent on to a card dispute or a consumer
 * forum. Rajat printed one and the PDF carried the whole shop around it - the
 * search box, the category strip, "Abha", and a footer of policy links. No
 * invoice looks like that.
 *
 * `Bill.jsx` had always styled itself for paper (`print:` throughout) and says
 * so in its own header: the browser makes the PDF, so the page is the layout.
 * What nobody hid was the chrome the ROOT layout wraps around every storefront
 * route - and the bill is one. So the intent was right and the output was
 * wrong, which is why it survived this long.
 *
 * Hidden on screen too, not only on paper: a document that looks like a
 * document is also the one a person trusts enough to keep.
 */
const DOCUMENT_PATHS = /^\/orders\/[^/]+\/bill\/?$/;

export default function ShopChrome({ children }) {
  const pathname = usePathname() || '/';
  const inPanel = PANEL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (inPanel || DOCUMENT_PATHS.test(pathname)) return null;
  return children;
}
