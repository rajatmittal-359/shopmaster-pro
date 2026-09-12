import AdminOrders from "@/components/admin/Orders";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Orders and disputes" };

export default function AdminOrdersPage() {
  return (
    <>
      <PageHeader
        title="Orders"
        lead="Every order on the platform; disputes and failed bookings first."
      />
      <AdminOrders />
    </>
  );
}
