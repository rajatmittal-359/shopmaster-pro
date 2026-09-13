'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The Products section's own tabs - Shopify's "Products · Inventory ·
 * Collections" row. The AI photo studio lives here because it works on
 * products, not beside them: Shopify Magic is a button inside the product
 * editor, Amazon's image tools sit inside the listing, and neither has an
 * "AI" page in its sidebar. Rajat, 12 Sep: "AI Studio alag cheez lagta hai".
 */
const TABS = [
  { href: '/seller/products', label: 'All products', end: true },
  { href: '/seller/products/studio', label: 'Photo studio' },
  { href: '/seller/products/stock', label: 'Stock history' },
];

export default function ProductsNav() {
  const pathname = usePathname();
  return (
    /* On a wide screen the sidebar shows these as sub-items under Products;
       the tab row stays for phones, where the sidebar is behind a button. */
    <nav aria-label="Products" className="mb-5 flex gap-1 border-b lg:hidden">
      {TABS.map((t) => {
        const active = t.end ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
