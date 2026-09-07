import OrderQueue from '@/components/seller/OrderQueue';

export const metadata = { title: 'Orders' };

export default function SellerOrdersPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Orders</h1>
      <OrderQueue />
    </>
  );
}
