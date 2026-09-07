'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';

/**
 * The basket.
 *
 * THE PRICE SHOWN IS THE SERVER'S, ALWAYS
 *   getCart re-prices every line on read, because a sale can start or end while
 *   something sits in a basket. If this component added the numbers up itself,
 *   the total on screen and the total charged could differ - which is the
 *   drip-pricing complaint the CCPA fined FirstCry over. So `totalAmount` comes
 *   from the response and nothing here recalculates it.
 *
 * EVERY CHANGE RE-READS THE CART
 *   Rather than patching local state to what we hoped happened. The server may
 *   have capped a quantity at the stock left, or re-priced a line in the same
 *   breath - and the honest thing to show is what it actually did.
 */
export default function CartView() {
  const { signedIn } = useSession();
  const [cart, setCart] = useState(null);
  const [state, setState] = useState({ status: 'loading' });

  const load = async () => {
    try {
      const data = await authedFetch('/customer/cart');
      setCart(data.cart || { items: [], totalAmount: 0 });
      setState({ status: 'idle' });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  /*
   * Only ever STARTS work. Being signed out is not a state to store - it is
   * read straight from the session below, because storing it means setting
   * state synchronously inside an effect, which React now flags as a cascading
   * render (and it would be one: render, effect, render again).
   *
   * It runs when the session appears rather than on mount: the server rendered
   * this as signed out because a server has no localStorage, and the browser
   * answers a moment later.
   */
  useEffect(() => {
    if (!signedIn) return undefined;

    // `cancelled` because the answer can arrive after this component is gone -
    // somebody who opens the cart and navigates away before Singapore replies.
    // Setting state then is a leak and a React warning.
    let cancelled = false;

    (async () => {
      try {
        const data = await authedFetch('/customer/cart');
        if (cancelled) return;
        setCart(data.cart || { items: [], totalAmount: 0 });
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const change = async (productId, quantity) => {
    setState({ status: 'working' });
    try {
      if (quantity < 1) await authedFetch(`/customer/cart/${productId}`, { method: 'DELETE' });
      else await authedFetch('/customer/cart', { method: 'PATCH', body: { productId, quantity } });
      await load();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (!signedIn) {
    return (
      <p className="text-muted-foreground">
        <Link href="/login?next=%2Fcart" className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to see what is in your cart.
      </p>
    );
  }

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  if (state.status === 'error') {
    return (
      <div>
        <p className="text-destructive">{state.message}</p>
        <Button onClick={load} className="mt-3" variant="link" size="sm">
          Try again
        </Button>
      </div>
    );
  }

  const items = (cart?.items || []).filter((i) => i.productId);

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nothing in it yet.{' '}
        <Link href="/shop" className="text-brand-ink underline">
          Have a look around
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const product = item.productId;
          const stock = Math.max(0, (product.stock || 0) - (product.reserved || 0));

          return (
            <li key={product._id} className="flex gap-4 py-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                {product.images?.[0] && (
                  <Image src={product.images[0]} alt="" fill sizes="80px" className="object-cover" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${product.slug || product._id}`}
                  className="font-medium hover:text-brand-ink"
                >
                  {product.name}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  ₹{Number(item.price).toLocaleString('en-IN')} each
                </p>

                <div className="mt-2 flex items-center gap-3">
                  <select
                    value={item.quantity}
                    onChange={(e) => change(product._id, Number(e.target.value))}
                    aria-label={`Quantity of ${product.name}`}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    {Array.from(
                      { length: Math.max(1, Math.min(stock || item.quantity, 10)) },
                      (_, i) => i + 1
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>

                  <Button
                    onClick={() => change(product._id, 0)} variant="destructive" size="sm">
                    Remove
                  </Button>
                </div>
              </div>

              <p className="font-medium">
                ₹{(Number(item.price) * item.quantity).toLocaleString('en-IN')}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl border border-border p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-xl font-semibold">
            ₹{Number(cart.totalAmount || 0).toLocaleString('en-IN')}
          </span>
        </div>
        {/* Said here rather than discovered at the last step. */}
        <p className="mt-1 text-xs text-muted-foreground">
          Delivery is worked out at checkout, from your PIN code. Nothing else is
          added.
        </p>

        <Link
          href="/checkout"
          className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground transition hover:opacity-90"
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
