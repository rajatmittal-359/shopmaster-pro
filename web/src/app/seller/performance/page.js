import Performance from '@/components/seller/Performance';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Performance' };

export default function SellerPerformancePage() {
  return (
    <>
      <PageHeader title="Performance" lead="How your shop is doing against the rules every seller signed - the last 30 days." />
      <Performance />
    </>
  );
}
