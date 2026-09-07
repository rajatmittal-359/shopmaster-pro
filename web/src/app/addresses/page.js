import Addresses from '@/components/account/Addresses';

export const metadata = { title: 'Your addresses', robots: { index: false, follow: true } };

export default function AddressesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your addresses</h1>
      <Addresses />
    </div>
  );
}
