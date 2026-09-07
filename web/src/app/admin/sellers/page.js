import Sellers from '@/components/admin/Sellers';

export const metadata = { title: 'Sellers' };

export default function AdminSellersPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sellers</h1>
      <Sellers />
    </>
  );
}
