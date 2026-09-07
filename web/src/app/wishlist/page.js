import Wishlist from '@/components/account/Wishlist';

export const metadata = { title: 'Saved items', robots: { index: false, follow: true } };

export default function WishlistPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Saved items</h1>
      <Wishlist />
    </div>
  );
}
