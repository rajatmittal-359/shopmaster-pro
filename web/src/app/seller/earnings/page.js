import Earnings from '@/components/seller/Earnings';

export const metadata = { title: 'Earnings' };

export default function SellerEarningsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Earnings</h1>
      <Earnings />
    </>
  );
}
