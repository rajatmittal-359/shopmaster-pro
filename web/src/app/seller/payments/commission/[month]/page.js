import CommissionBill from '@/components/seller/CommissionBill';

export const metadata = { title: 'Commission bill' };

export default async function CommissionBillPage({ params }) {
  const { month } = await params;
  return <CommissionBill month={month} />;
}
