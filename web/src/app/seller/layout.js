import SellerGuard from '@/components/seller/SellerGuard';
import PanelShell from '@/components/panel/PanelShell';
import AgreementBanner from '@/components/seller/AgreementBanner';
import Onboarding from '@/components/seller/Onboarding';
import Tour from '@/components/panel/Tour';
import PanelIdentity from '@/components/panel/PanelIdentity';

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
 * NINE NAMES IN FIVE GROUPS (13 Sep 2026). The first cut had five items and
 * Rajat called it too thin. Meesho's supplier panel, Flipkart Seller Hub,
 * Amazon's 2026 workspaces and Shopify were laid side by side: every one has
 * Returns, Promotions, Performance and Help besides the five, so this does
 * too - in our words. Groups because nine names need headings; badges on
 * the queues; Products carries its own sub-items; Settings and Help pinned
 * low. The AI still has no page of its own: it sits inside the product work.
 */
const GROUPS = [
  { items: [{ href: '/seller', label: 'Home', icon: 'LayoutDashboard', end: true }] },
  {
    label: 'Selling',
    items: [
      { href: '/seller/orders', label: 'Orders', icon: 'Package', badge: 'orders' },
      { href: '/seller/issues', label: 'Returns & issues', icon: 'Undo2', badge: 'issues' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      {
        href: '/seller/products',
        label: 'Products',
        icon: 'Tag',
        children: [
          { href: '/seller/products', label: 'All products', end: true },
          { href: '/seller/products/studio', label: 'Photo studio' },
          { href: '/seller/products/stock', label: 'Stock history' },
        ],
      },
      { href: '/seller/promotions', label: 'Promotions', icon: 'TicketPercent' },
      { href: '/seller/grow', label: 'Get found on Google', icon: 'Globe' },
    ],
  },
  { label: 'Money', items: [{ href: '/seller/payments', label: 'Payments', icon: 'IndianRupee' }] },
  {
    label: 'Account',
    pinned: true,
    items: [
      { href: '/seller/performance', label: 'Performance', icon: 'Gauge' },
      { href: '/seller/settings', label: 'Settings', icon: 'Settings' },
      { href: '/seller/learn', label: 'Learn', icon: 'GraduationCap' },
      { href: '/seller/help', label: 'Help & rules', icon: 'LifeBuoy' },
      { href: '/seller/ask', label: 'Ask ShopMaster', icon: 'MessageCircleQuestion' },
    ],
  },
];

export default function SellerLayout({ children }) {
  return (
    <PanelShell title="Seller" groups={GROUPS} countsUrl="/seller/nav-counts" identity={<PanelIdentity kind="seller" />}>
      <SellerGuard>
        <Onboarding>
          <AgreementBanner />
          {children}
          {/* Three coach marks the first time, then never again (Tour.jsx). */}
          <Tour
            id="seller"
            steps={[
              { target: '/seller/orders', title: 'Orders land here', body: 'When a customer pays, the order appears in "To pack". One button books the courier.' },
              { target: '/seller/products', title: 'Your products', body: 'Add one with a photo - the AI writes the words. The photo studio and stock history are tabs here.' },
              { target: '/seller/payments', title: 'Your money', body: 'Paid to your bank 7 days after each delivery. Every rupee, and why, is listed here.' },
            ]}
          />
        </Onboarding>
      </SellerGuard>
    </PanelShell>
  );
}
