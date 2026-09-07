import Link from 'next/link';
import ProductTable from '@/components/seller/ProductTable';

export const metadata = { title: 'Products' };

export default function SellerProductsPage() {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <Link
          href="/seller/products/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          List a product
        </Link>
      </div>
      <ProductTable />
    </>
  );
}
