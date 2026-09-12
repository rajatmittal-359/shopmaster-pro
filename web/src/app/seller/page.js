import SellerDashboard from '@/components/seller/Dashboard';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Dashboard' };

export default function SellerHome() {
  return (
    <>
      <PageHeader title="Home" lead="Today, at a glance." />
      <SellerDashboard />
    </>
  );
}
