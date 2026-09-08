import ProductForm from '@/components/seller/ProductForm';

export const metadata = { title: 'List a product' };

export default async function NewProductPage({ searchParams }) {
  const params = await searchParams;
  // ?from=<id> means "another size of this one" - the form copies it.
  const from = Array.isArray(params.from) ? params.from[0] : params.from;

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {from ? 'Add another size' : 'List a product'}
      </h1>
      <ProductForm copyFromId={from || undefined} />
    </>
  );
}
