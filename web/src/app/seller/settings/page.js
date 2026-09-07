import SellerSettings from '@/components/seller/Settings';

export const metadata = { title: 'Settings' };

export default function SellerSettingsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
      <SellerSettings />
    </>
  );
}
