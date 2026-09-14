import Help from '@/components/seller/Help';
import PageHeader from '@/components/panel/PageHeader';
import { businessFrom } from '@/config/policy';
import { getSettings } from '@/lib/api';

export const metadata = { title: 'Help & rules' };

export default async function SellerHelpPage() {
  const business = businessFrom(await getSettings());
  return (
    <>
      <PageHeader title="Help & rules" lead="The agreement in plain words, the questions sellers ask, and a person to talk to." />
      <Help business={business} />
    </>
  );
}
