import SellerSettings from '@/components/seller/Settings';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Settings' };

export default function SellerSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" lead="Where the courier collects, and what you charge for delivery." />
      <SellerSettings />
    </>
  );
}
