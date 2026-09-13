import Learn from '@/components/seller/Learn';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Learn' };

export default function SellerLearnPage() {
  return (
    <>
      <PageHeader title="Learn" lead="Five short lessons - the daily work of the shop, step by step, with the button that does each thing." />
      <Learn />
    </>
  );
}
