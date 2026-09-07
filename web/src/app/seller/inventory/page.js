import LogTable from '@/components/inventory/LogTable';

export const metadata = { title: 'Stock history' };

export default function SellerInventoryPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Stock history</h1>
      <LogTable />
    </>
  );
}
