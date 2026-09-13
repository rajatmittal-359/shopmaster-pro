import AskPanel from '@/components/assist/AskPanel';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Ask ShopMaster' };

export default function SellerAskPage() {
  return (
    <>
      <PageHeader title="Ask ShopMaster" lead="Ask about an order, a payout, a rule, or how Amazon does it - in Hindi or English." />
      <AskPanel role="seller" />
    </>
  );
}
