import Studio from '@/components/ai/Studio';
import ProductsNav from '@/components/seller/ProductsNav';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Photo studio' };

export default function SellerPhotoStudioPage() {
  return (
    <>
      <PageHeader
        title="Products"
        lead="Clean up a product photo, show it in use, or describe a scene - then put it on the product from here."
      />
      <ProductsNav />
      <Studio base="/seller" />
    </>
  );
}
