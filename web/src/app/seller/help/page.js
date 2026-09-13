import Help from '@/components/seller/Help';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Help & rules' };

export default function SellerHelpPage() {
  return (
    <>
      <PageHeader title="Help & rules" lead="The agreement in plain words, the questions sellers ask, and a person to talk to." />
      <Help />
    </>
  );
}
