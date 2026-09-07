import OrderDetail from '@/components/orders/OrderDetail';

export const metadata = {
  title: 'Your order',
  robots: { index: false, follow: true },
};

export default async function OrderPage({ params }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <OrderDetail orderId={id} />
    </div>
  );
}
