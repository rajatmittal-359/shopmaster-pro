import Script from 'next/script';
import CheckoutView from '@/components/checkout/CheckoutView';

export const metadata = {
  title: 'Checkout',
  robots: { index: false, follow: true },
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/*
        Razorpay's own script, from Razorpay's own domain - it cannot be bundled,
        and it must be theirs so card details never touch our origin.
        lazyOnload: it is needed when the button is pressed, not while the page
        is painting, and this page is behind a login so it is never what Google
        measures.
      */}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <div className="mt-6">
        <CheckoutView />
      </div>
    </div>
  );
}
