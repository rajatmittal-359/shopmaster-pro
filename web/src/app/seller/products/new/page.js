import ProductForm from '@/components/seller/ProductForm';

export const metadata = { title: 'List a product' };

export default function NewProductPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">List a product</h1>
      <ProductForm />
    </>
  );
}
