'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import AddressPicker from '@/components/checkout/AddressPicker';

/**
 * Paying.
 *
 * THE ONE RULE THIS PAGE IS BUILT AROUND
 *   Every number shown here comes from `/customer/checkout-preview`, which
 *   prices the delivery through the SAME helper the real checkout uses. Nothing
 *   on this page adds up a total of its own. A screen total that differs from
 *   the charged one - even by the shipping - is the drip-pricing complaint the
 *   CCPA fined FirstCry Rs 2 lakh over, and it is the easiest way in the world
 *   to write by accident.
 *
 * WHY THE PREVIEW RE-RUNS ON EVERY CHANGE
 *   Shipping depends on the address, on cash-on-delivery, and on which delivery
 *   option was picked. Changing any of the three and leaving the old total on
 *   screen would be showing a price for a different order.
 */
export default function CheckoutView() {
  const router = useRouter();
  const { signedIn } = useSession();

  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [payment, setPayment] = useState('online');
  const [deliveryOption, setDeliveryOption] = useState(undefined);
  const [totals, setTotals] = useState(null);
  const [coupon, setCoupon] = useState(null);
  const [code, setCode] = useState('');
  const [state, setState] = useState({ status: 'loading' });

  /** Addresses first: without one there is nothing to price. */
  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const data = await authedFetch('/customer/addresses');
        if (cancelled) return;
        const list = data.addresses || data || [];
        setAddresses(list);
        // The one marked default, else the first. Somebody with one address
        // should never have to choose it.
        const preferred = list.find((a) => a.isDefault) || list[0];
        setAddressId(preferred?._id || null);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  /*
   * Re-prices whenever the address, the payment method or the delivery option
   * changes - shipping depends on all three, and leaving an old total on screen
   * is showing the price of a different order.
   *
   * Written inline with a `cancelled` flag rather than as a called function:
   * a reply can arrive after the shopper has changed the address again, and
   * the older, slower answer must not overwrite the newer one.
   */
  useEffect(() => {
    if (!addressId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const data = await authedFetch('/customer/checkout-preview', {
          method: 'POST',
          body: {
            shippingAddressId: addressId,
            paymentMethod: payment === 'cod' ? 'cod' : 'online',
            deliveryOption,
          },
        });
        if (cancelled) return;
        setTotals(data);
        // The server decides which option is in force. Echoing it back keeps
        // the radio in step with what was actually priced.
        if (data.deliveryOption && data.deliveryOption !== deliveryOption) {
          setDeliveryOption(data.deliveryOption);
        }
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addressId, payment, deliveryOption]);

  const applyCoupon = async (e) => {
    e.preventDefault();
    try {
      const data = await authedFetch('/customer/coupons/preview', {
        method: 'POST',
        body: { code },
      });
      // The endpoint answers 200 with success:false for a code that is real but
      // does not apply - "spend Rs 500 more", say. That message is the useful
      // part, so it is shown rather than swallowed.
      setCoupon(data.success ? data : { failed: true, message: data.message });
    } catch (err) {
      setCoupon({ failed: true, message: err.message });
    }
  };

  const placeOrder = async () => {
    setState({ status: 'placing' });
    const body = {
      shippingAddressId: addressId,
      deliveryOption,
      couponCode: coupon?.code || undefined,
    };

    try {
      if (payment === 'cod') {
        const data = await authedFetch('/customer/checkout-cod', { method: 'POST', body });
        if (!data.order?._id) throw new Error(data.message || 'Order could not be placed');
        router.push('/orders');
        return;
      }

      const started = await authedFetch('/customer/checkout-online', { method: 'POST', body });

      if (!window.Razorpay) {
        // The order EXISTS at this point, unpaid. Saying so is honest;
        // pretending nothing happened would have somebody order twice.
        throw new Error(
          'The payment window could not load. Your order is saved and unpaid - refresh and open it from My orders.'
        );
      }

      const rzp = new window.Razorpay({
        key: started.keyId,
        amount: started.amount,
        currency: started.currency,
        name: 'ShopMaster Pro',
        order_id: started.orderId,
        handler: async (response) => {
          try {
            await authedFetch('/customer/verify-payment', {
              method: 'POST',
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                dbOrderId: started.dbOrderId,
              },
            });
            router.push('/orders');
          } catch (err) {
            setState({
              status: 'error',
              message: `${err.message} If money left your account, do not pay again - contact us with your order number.`,
            });
          }
        },
        modal: {
          ondismiss: () =>
            setState({
              status: 'error',
              message: 'Payment cancelled. Nothing was charged - you can try again.',
            }),
        },
        theme: { color: '#E8A33D' },
      });

      rzp.on('payment.failed', (response) =>
        setState({ status: 'error', message: response.error?.description || 'Payment failed' })
      );

      rzp.open();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (!signedIn) {
    return (
      <p className="text-muted-foreground">
        <Link href="/login?next=%2Fcheckout" className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to place your order.
      </p>
    );
  }

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  const discount = coupon && !coupon.failed ? Number(coupon.discount) || 0 : 0;
  const payable = totals ? Math.max(0, totals.grandTotal - discount) : null;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <AddressPicker
          addresses={addresses}
          selectedId={addressId}
          onSelect={setAddressId}
          onAdded={(address) => {
            setAddresses((list) => [...list, address]);
            setAddressId(address._id);
          }}
        />

        {/*
          Shown even when there is only ONE option, because the useful part is
          not the choice - it is the DATE. Hiding the block when a single
          courier serves the PIN code would mean the shopper sees a shipping
          charge with no idea when it arrives.
        */}
        {totals?.deliveryOptions?.length > 0 && (
          <section className="rounded-xl border border-border p-4">
            <h2 className="font-semibold">Delivery</h2>
            <ul className="mt-3 space-y-2">
              {totals.deliveryOptions.map((option) => (
                <li key={option.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary">
                    {totals.deliveryOptions.length > 1 && (
                      <input
                        type="radio"
                        name="delivery"
                        checked={deliveryOption === option.id}
                        onChange={() => setDeliveryOption(option.id)}
                      />
                    )}
                    <span className="flex-1">
                      <strong>{option.label}</strong>
                      {/* arrivalBy is a date the courier gave; etaText is how
                          the server phrased it. Both come from the same call
                          that priced this option, so they cannot disagree with
                          the charge beside them. */}
                      {(option.arrivalBy || option.etaText) && (
                        <span className="block text-muted-foreground">
                          {option.etaText || `Arrives by ${option.arrivalBy}`}
                        </span>
                      )}
                      {option.courier && (
                        <span className="block text-xs text-muted-foreground">{option.courier}</span>
                      )}
                    </span>
                    <span>
                      {Number(option.price) > 0
                        ? `₹${Number(option.price).toLocaleString('en-IN')}`
                        : 'Free'}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-border p-4">
          <h2 className="font-semibold">Payment</h2>
          <div className="mt-3 space-y-2 text-sm">
            {[
              ['online', 'Pay now', 'Card, UPI, netbanking or wallet, through Razorpay'],
              ['cod', 'Cash on delivery', 'Pay the delivery agent when it arrives'],
            ].map(([value, label, note]) => (
              <label
                key={value}
                className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary"
              >
                <input
                  type="radio"
                  name="payment"
                  checked={payment === value}
                  onChange={() => setPayment(value)}
                  className="mt-1"
                />
                <span>
                  <strong>{label}</strong>
                  <span className="block text-muted-foreground">{note}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-xl border border-border p-4">
        <h2 className="font-semibold">Your total</h2>

        {totals ? (
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Items</dt>
              <dd>₹{Number(totals.itemsTotal).toLocaleString('en-IN')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd>
                {totals.shippingCharges > 0
                  ? `₹${Number(totals.shippingCharges).toLocaleString('en-IN')}`
                  : 'Free'}
              </dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-brand-ink">
                <dt>Coupon {coupon.code}</dt>
                <dd>-₹{discount.toLocaleString('en-IN')}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>To pay</dt>
              <dd>₹{Number(payable).toLocaleString('en-IN')}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Choose an address to see delivery and the total.
          </p>
        )}

        <form onSubmit={applyCoupon} className="mt-4 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Coupon code"
            aria-label="Coupon code"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md border border-border px-3 text-sm hover:bg-accent">
            Apply
          </button>
        </form>
        {coupon && (
          <p className={`mt-2 text-sm ${coupon.failed ? 'text-destructive' : 'text-muted-foreground'}`}>
            {coupon.message}
          </p>
        )}

        <button
          onClick={placeOrder}
          disabled={!addressId || !totals || state.status === 'placing'}
          className="mt-4 h-11 w-full rounded-lg bg-primary font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {state.status === 'placing' ? 'Placing…' : payment === 'cod' ? 'Place order' : 'Pay now'}
        </button>

        <p aria-live="polite" className="mt-2 min-h-5 text-sm">
          {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
        </p>

        <p className="mt-3 text-xs text-muted-foreground">
          The coupon is checked again by the server when the order is placed, so
          what you are charged is what it decides - not this page.
        </p>
      </aside>
    </div>
  );
}
