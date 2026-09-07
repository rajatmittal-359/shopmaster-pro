import Coupons from '@/components/admin/Coupons';

export const metadata = { title: 'Coupons' };

export default function AdminCouponsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Coupons</h1>
      <Coupons />
    </>
  );
}
