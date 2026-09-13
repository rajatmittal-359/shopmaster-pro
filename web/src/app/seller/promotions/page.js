import Promotions from '@/components/seller/Promotions';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Promotions' };

export default function SellerPromotionsPage() {
  return (
    <>
      <PageHeader title="Promotions" lead="Coupon codes off your own products. They work at checkout, show on the Coupons page, and reach Google Shopping overnight." />
      <Promotions />
    </>
  );
}
