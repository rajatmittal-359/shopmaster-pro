import Earnings from '@/components/seller/Earnings';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Payments' };

export default function SellerPaymentsPage() {
  return (
    <>
      <PageHeader title="Payments" lead="What you have earned, what is on hold, and where it is paid." />
      <Earnings />
    </>
  );
}
