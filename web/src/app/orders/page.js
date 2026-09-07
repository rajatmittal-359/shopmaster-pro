import OrdersList from '@/components/orders/OrdersList';

export const metadata = {
  title: 'My orders',
  robots: { index: false, follow: true },
};

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">My orders</h1>
      <div className="mt-6">
        <OrdersList />
      </div>
    </div>
  );
}
