import ProductForm from '@/components/seller/ProductForm';

export const metadata = { title: 'Edit a product' };

export default async function EditProductPage({ params }) {
  const { id } = await params;
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit</h1>
      <ProductForm productId={id} />
    </>
  );
}
