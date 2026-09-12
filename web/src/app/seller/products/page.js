import { Suspense } from 'react';
import Link from 'next/link';
import ProductTable from '@/components/seller/ProductTable';
import ProductsNav from '@/components/seller/ProductsNav';
import PageHeader from '@/components/panel/PageHeader';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Products' };

export default function SellerProductsPage() {
  return (
    <>
      <PageHeader
        title="Products"
        lead="What you sell, what is live, and the stock count you change every day."
        action={
          <Button nativeButton={false} render={<Link href="/seller/products/new" />}>
            List a product
          </Button>
        }
      />
      <ProductsNav />
      <Suspense fallback={null}>
        <ProductTable />
      </Suspense>
    </>
  );
}
