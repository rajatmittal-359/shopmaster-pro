import ProductTable from '@/components/seller/ProductTable';

export const metadata = { title: 'Products' };

export default function SellerProductsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Products</h1>
      <ProductTable />
    </>
  );
}
