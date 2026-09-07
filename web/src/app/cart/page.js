import CartView from '@/components/cart/CartView';

export const metadata = {
  title: 'Your cart',
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
      <div className="mt-6">
        <CartView />
      </div>
    </div>
  );
}
