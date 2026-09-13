import CouponsList from '@/components/account/CouponsList';

export const metadata = {
  title: 'Coupons',
  description: 'Every coupon code running on ShopMaster Pro right now, with its rules.',
  alternates: { canonical: '/coupons' },
};

export default function CouponsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
      <p className="mt-1 text-sm text-muted-foreground">Codes you can use today. Type one at checkout; the discount shows before you pay.</p>
      <div className="mt-6">
        <CouponsList />
      </div>
    </div>
  );
}
