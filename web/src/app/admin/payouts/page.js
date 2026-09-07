import Payouts from '@/components/admin/Payouts';

export const metadata = { title: 'Payouts' };

export default function AdminPayoutsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Payouts</h1>
      <Payouts />
    </>
  );
}
