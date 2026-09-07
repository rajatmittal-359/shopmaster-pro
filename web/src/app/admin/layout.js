import Link from 'next/link';
import AdminGuard from '@/components/admin/AdminGuard';

export const metadata = {
  title: { default: 'Admin', template: '%s · Admin · ShopMaster Pro' },
  robots: { index: false, follow: false },
};

/**
 * The operator's area.
 *
 * Ordered by what can lose somebody money, not alphabetically: payouts first
 * because that is real money owed to real people, disputes next because a
 * customer and a seller disagreeing has no other resolution path, then the
 * housekeeping.
 */
const LINKS = [
  ['/admin', 'Overview'],
  ['/admin/payouts', 'Payouts'],
  ['/admin/orders', 'Orders & disputes'],
  ['/admin/sellers', 'Sellers'],
  ['/admin/categories', 'Categories'],
  ['/admin/coupons', 'Coupons'],
];

export default function AdminLayout({ children }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-border text-sm">
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

      <AdminGuard>{children}</AdminGuard>
    </div>
  );
}
