import ProductReport from '@/components/seller/ProductReport';

export const metadata = { title: 'Listing report' };

export default async function ProductReportPage({ params }) {
  const { id } = await params;
  return <ProductReport productId={id} />;
}
