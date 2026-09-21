'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Heart, ShoppingBag, UserRound } from 'lucide-react';
import { useSession } from '@/lib/session';

/**
 * The bottom tab bar on phones.
 *
 * Flipkart, Meesho and Myntra put five tabs under the thumb - Home,
 * Categories, Wishlist, Bag, You - because on a phone the top of the
 * screen is the farthest place from the hand, and a hamburger is a door
 * people do not open. This is the single biggest "feels like an app"
 * difference a storefront can make, and it costs nothing.
 *
 * Hidden on `md` and up (the header does the job there), in the panels
 * (ShopChrome hides it), and on checkout (nothing may compete with Pay).
 */
const TABS = [
  { href: '/', label: 'Home', icon: Home, end: true },
  { href: '/shop', label: 'Shop', icon: LayoutGrid },
  { href: '/wishlist', label: 'Saved', icon: Heart },
  { href: '/cart', label: 'Bag', icon: ShoppingBag },
  { href: '/account', label: 'You', icon: UserRound, auth: true },
];

export default function BottomNav() {
  const pathname = usePathname() || '/';
  const { signedIn } = useSession();
  if (pathname.startsWith('/checkout')) return null;

  return (
    <nav
      aria-label="Main"
      className="glass fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, end, auth }) => {
          const target = auth && !signedIn ? `/login?next=${encodeURIComponent('/account')}` : href;
          const active = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={target}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-medium ${active ? 'text-brand-ink' : 'text-muted-foreground'}`}
              >
                <Icon className={`size-5 ${active ? 'stroke-[2.25]' : ''}`} {...(href === '/cart' ? { 'data-cart-target': '' } : {})} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
