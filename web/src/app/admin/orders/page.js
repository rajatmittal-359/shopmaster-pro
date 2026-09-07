import AdminOrders from '@/components/admin/Orders';

export const metadata = { title: 'Orders and disputes' };

export default function AdminOrdersPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Orders and disputes</h1>
      <AdminOrders />
    </>
  );
}
