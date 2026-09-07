import SellerOrderDetail from '@/components/seller/OrderDetail';

export const metadata = { title: 'Order' };

export default async function SellerOrderPage({ params }) {
  const { id } = await params;
  return <SellerOrderDetail orderId={id} />;
}
