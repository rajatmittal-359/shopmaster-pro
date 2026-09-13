import Grow from '@/components/seller/Grow';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Get found on Google' };

export default function SellerGrowPage() {
  return (
    <>
      <PageHeader title="Get found on Google" lead="What the platform already does for your shop, and the ten things only you can do - in the order they pay off." />
      <Grow />
    </>
  );
}
