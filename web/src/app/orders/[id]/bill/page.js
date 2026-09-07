import Bill from '@/components/orders/Bill';

export const metadata = { title: 'Bill of Supply', robots: { index: false, follow: false } };

export default async function BillPage({ params }) {
  const { id } = await params;
  return <Bill orderId={id} />;
}
