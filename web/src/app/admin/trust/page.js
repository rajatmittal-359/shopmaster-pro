import TrustQueue from '@/components/admin/TrustQueue';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Trust queue' };

export default function AdminTrustPage() {
  return (
    <>
      <PageHeader title="Trust queue" lead="What the moderator and the rulebook held for a person - reviews, seller Abouts, returns, flagged disputes - each with its reason and its button." />
      <TrustQueue />
    </>
  );
}
