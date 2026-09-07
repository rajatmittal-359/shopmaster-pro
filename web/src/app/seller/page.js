import SellerDashboard from '@/components/seller/Dashboard';

export const metadata = { title: 'Dashboard' };

export default function SellerHome() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your shop</h1>
      <SellerDashboard />
    </>
  );
}
