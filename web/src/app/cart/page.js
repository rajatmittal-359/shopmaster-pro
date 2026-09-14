import CartView from '@/components/cart/CartView';
import { getSettings } from '@/lib/api';

export const metadata = {
  title: 'Your cart',
  robots: { index: false, follow: true },
};

export default async function CartPage() {
  // The admin's "free delivery above ₹X" (Settings → Switches), so the cart
  // can say how far the basket is from it - the nudge Amazon and Flipkart
  // print under the subtotal. 0 or no settings: nothing is said.
  const settings = await getSettings();
  const freeAbove = Number(settings?.shop?.freeShippingAbove) || 0;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
      <div className="mt-6">
        <CartView freeAbove={freeAbove} />
      </div>
    </div>
  );
}
