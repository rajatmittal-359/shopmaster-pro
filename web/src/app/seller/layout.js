import SellerGuard from '@/components/seller/SellerGuard';
import PanelShell from '@/components/panel/PanelShell';
import AgreementBanner from '@/components/seller/AgreementBanner';
import Onboarding from '@/components/seller/Onboarding';
import Tour from '@/components/panel/Tour';

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
 * FIVE NAMES, NO GROUPS (12 Sep 2026). Shopify's admin, Seller Central and
 * Meesho's supplier panel all run on the same five nouns - Home, Orders,
 * Products, Payments, Settings - and none of them has an "AI" page: the AI
 * sits inside the product work. So the photo studio and the stock history
 * became tabs of Products, "Earnings" became Payments (the word every
 * platform uses), and the group labels went - five items need no headings.
 */
const GROUPS = [
  {
    items: [
      { href: '/seller', label: 'Home', icon: 'LayoutDashboard', end: true },
      { href: '/seller/orders', label: 'Orders', icon: 'Package' },
      { href: '/seller/products', label: 'Products', icon: 'Tag' },
      { href: '/seller/payments', label: 'Payments', icon: 'IndianRupee' },
      { href: '/seller/settings', label: 'Settings', icon: 'Settings' },
    ],
  },
];

export default function SellerLayout({ children }) {
  return (
    <PanelShell title="Seller" groups={GROUPS}>
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
