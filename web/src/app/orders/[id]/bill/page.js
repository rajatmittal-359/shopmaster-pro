import Bill from '@/components/orders/Bill';
import { businessFrom } from '@/config/policy';
import { getSettings } from '@/lib/api';

export const metadata = { title: 'Bill of Supply', robots: { index: false, follow: false } };

export default async function BillPage({ params }) {
  const { id } = await params;
  // The seller of record on the bill is whatever Settings says today.
  return <Bill orderId={id} business={businessFrom(await getSettings())} />;
}
