import Link from 'next/link';
import SellerGuard from '@/components/seller/SellerGuard';

export const metadata = {
  title: { default: 'Seller', template: '%s · Seller · ShopMaster Pro' },
  robots: { index: false, follow: false },
};

/**
 * The seller area's own frame.
 *
 * `robots: noindex, nofollow` on the whole subtree. None of it is meant for
 * search, and a dashboard indexed by Google is a dashboard whose URLs strangers
 * find - which is not an authorisation failure by itself, but every one of
 * those visits is a wasted crawl of a shop that has little crawl budget.
 */
const LINKS = [
  ['/seller', 'Dashboard'],
  ['/seller/orders', 'Orders'],
  ['/seller/products', 'Products'],
  ['/seller/earnings', 'Earnings'],
  ['/seller/inventory', 'Stock history'],
  ['/seller/settings', 'Settings'],
];

export default function SellerLayout({ children }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 flex gap-1 border-b border-border text-sm">
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="border-b-2 border-transparent px-3 py-2 text-muted-foreground transition hover:border-primary hover:text-brand-ink"
          >
            {label}
          </Link>
        ))}
      </nav>

      <SellerGuard>{children}</SellerGuard>
    </div>
  );
}
