import { Suspense } from 'react';
import OrderQueue from '@/components/seller/OrderQueue';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Orders' };

/**
 * The queue reads its tab from the URL, which in the App Router means it
 * must sit under a Suspense boundary; the fallback is nothing because the
 * queue draws its own skeleton.
 */
export default function SellerOrdersPage() {
  return (
    <>
      <PageHeader title="Orders" lead="What is waiting, what is on its way, and what came back." />
      <Suspense fallback={null}>
        <OrderQueue />
      </Suspense>
    </>
  );
}
