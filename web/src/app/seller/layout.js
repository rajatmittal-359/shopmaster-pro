import SellerGuard from '@/components/seller/SellerGuard';
import PanelShell from '@/components/panel/PanelShell';
import AgreementBanner from '@/components/seller/AgreementBanner';

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
 *
 * GROUPED, because a flat list of six says nothing about what any of them is
 * for. Selling is the daily work, money is the reason for doing it, and the
 * last two are the things you open once a month.
 */
const GROUPS = [
  {
    items: [{ href: '/seller', label: 'Dashboard', icon: 'LayoutDashboard', end: true }],
  },
  {
    label: 'Selling',
    items: [
      { href: '/seller/orders', label: 'Orders', icon: 'Package' },
      { href: '/seller/products', label: 'Products', icon: 'Tag' },
    ],
  },
  {
    label: 'Money',
    items: [{ href: '/seller/earnings', label: 'Earnings', icon: 'IndianRupee' }],
  },
  {
    label: 'Records',
    items: [
      { href: '/seller/inventory', label: 'Stock history', icon: 'History' },
      { href: '/seller/settings', label: 'Settings', icon: 'Settings' },
      { href: '/seller/ai', label: 'AI Studio', icon: 'Sparkles' },
    ],
  },
];

export default function SellerLayout({ children }) {
  return (
    <PanelShell title="Seller" groups={GROUPS}>
      <SellerGuard>
        <AgreementBanner />
        {children}
      </SellerGuard>
    </PanelShell>
  );
}
