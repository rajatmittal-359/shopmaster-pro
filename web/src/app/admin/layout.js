import AdminGuard from "@/components/admin/AdminGuard";
import Tour from "@/components/panel/Tour";
import PanelShell from "@/components/panel/PanelShell";

export const metadata = {
  title: { default: "Admin", template: "%s · Admin · ShopMaster Pro" },
  robots: { index: false, follow: false },
};

/**
 * The operator's area.
 *
 * Ordered by what can lose somebody money, not alphabetically: payouts first
 * because that is real money owed to real people, disputes next because a
 * customer and a seller disagreeing has no other resolution path, then the
 * housekeeping.
 *
 * The GROUPS say that out loud. Seven flat links could not - and by the seventh
 * they had started wrapping onto a second row anyway.
 */
const GROUPS = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: "LayoutDashboard", end: true },
    ],
  },
  {
    label: "Money",
    items: [{ href: "/admin/payouts", label: "Payouts", icon: "IndianRupee" }],
  },
  {
    label: "Needs a person",
    items: [
      {
        href: "/admin/orders",
        label: "Orders & disputes",
        icon: "MessageSquareWarning",
      },
      { href: "/admin/sellers", label: "Sellers", icon: "Store" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/admin/categories", label: "Categories", icon: "FolderTree" },
      { href: "/admin/coupons", label: "Coupons", icon: "TicketPercent" },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/admin/inventory", label: "Stock history", icon: "History" },
    ],
  },
  {
    label: "AI",
    items: [{ href: "/admin/ai", label: "AI Studio", icon: "Sparkles" }],
  },
];

export default function AdminLayout({ children }) {
  return (
    <PanelShell title="Admin" groups={GROUPS}>
      <AdminGuard>
        {children}
        <Tour
          id="admin"
          steps={[
            { target: '/admin/orders', title: 'Where decisions wait', body: 'Open disputes, failed courier bookings and returns needing a ruling - with the evidence beside each.' },
            { target: '/admin/sellers', title: 'Who sells here', body: 'Approve, suspend, set a commission. Their agreement version and cancel rate are on the row.' },
            { target: '/admin/payouts', title: 'Who is owed money', body: 'Create a payout once the return window has closed; mark it paid with the bank reference.' },
          ]}
        />
      </AdminGuard>
    </PanelShell>
  );
}
