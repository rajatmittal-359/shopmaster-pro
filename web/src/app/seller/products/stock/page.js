import LogTable from '@/components/inventory/LogTable';
import ProductsNav from '@/components/seller/ProductsNav';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Stock history' };

export default function SellerStockHistoryPage() {
  return (
    <>
      <PageHeader title="Products" lead="Every change to a stock count, who made it and why." />
      <ProductsNav />
      <LogTable />
    </>
  );
}
