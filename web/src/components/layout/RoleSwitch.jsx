'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';

/**
 * One account, two hats - and a visible switch between them.
 *
 * Etsy puts "Shop Manager" in the header the moment an account has a shop;
 * a seller is never left guessing how to get back to buying, or to selling.
 * Ours is a segmented control - Shopping | Selling (| Admin) - drawn only
 * when the account holds more than one role, the current one lit. Rajat,
 * 12 Sep 2026: "ek toggle, view as seller / view as customer, dono ek saath
 * nahi." Roles are capabilities on the same login (plan §9), so switching
 * is navigation, not a re-login.
 */
export default function RoleSwitch({ className = '' }) {
  const pathname = usePathname();
  const { signedIn, canSell, isAdmin } = useSession();
  if (!signedIn || (!canSell && !isAdmin)) return null;

  const current = pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/seller') ? 'seller' : 'shop';
  const options = [
    { id: 'shop', label: 'Shopping', href: '/' },
    ...(canSell ? [{ id: 'seller', label: 'Selling', href: '/seller' }] : []),
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', href: '/admin' }] : []),
  ];

  return (
    <nav aria-label="Switch view" className={`flex rounded-lg bg-muted p-0.5 text-xs ${className}`}>
      {options.map((o) => {
        const active = o.id === current;
        return (
          <Link
            key={o.id}
            href={o.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-2.5 py-1 transition ${
              active ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
