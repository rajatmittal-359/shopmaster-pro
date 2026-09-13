import { Suspense } from 'react';
import Issues from '@/components/seller/Issues';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Returns & issues' };

export default function SellerIssuesPage() {
  return (
    <>
      <PageHeader title="Returns & issues" lead="Returns and exchanges, disputes, and parcels the courier could not deliver - each with what to do next." />
      <Suspense fallback={null}>
        <Issues />
      </Suspense>
    </>
  );
}
