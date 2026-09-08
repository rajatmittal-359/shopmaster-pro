'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import NotForThisAccount from '@/components/common/NotForThisAccount';

/**
 * What you have bought.
 *
 * THE STATUS SHOWN IS THE SERVER'S WORD, NOT A GUESS
 *   `order.status` is computed in the backend from the fulfilments - one order
 *   can be two parcels from two sellers, at two different stages. Deriving a
 *   headline here from the items would eventually disagree with the order page,
 *   and a customer told two different things about the same parcel stops
 *   believing both.
 *
 * `canCancel` COMES FROM THE SERVER TOO
 *   The list used to draw a Cancel button on shipped parcels the API would then
 *   refuse. A button that cannot work is worse than no button.
 */
const STATUS_TONE = {
  delivered: 'text-green-700 dark:text-green-400',
  cancelled: 'text-muted-foreground',
  returned: 'text-muted-foreground',
};

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const when = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function OrdersList() {
  const { signedIn } = useSession();
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const data = await authedFetch('/customer/orders');
        if (cancelled) return;
        setOrders(data.orders || []);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message, code: err.status });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <p className="text-muted-foreground">
        <Link href="/login?next=%2Forders" className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to see your orders.
      </p>
    );
  }

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;
  /* 403 is the capability model, not a fault - see NotForThisAccount. */
  if (state.status === 'error' && state.code === 403) {
    return (
      <NotForThisAccount detail="This account is for running the shop, not for buying on it. Orders placed as a shopper live on a shopping account." />
    );
  }

  if (state.status === 'error') return <p className="text-destructive">{state.message}</p>;

  if (orders.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nothing yet.{' '}
        <Link href="/shop" className="text-brand-ink underline">
          Have a look around
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {orders.map((order) => {
        const items = (order.items || []).filter((i) => i.productId);

        return (
          <li key={order._id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-medium">
                  {/* The human-readable number when there is one; the id is a
                      fallback nobody should have to read aloud. */}
                  {order.orderNumber || `Order ${String(order._id).slice(-6).toUpperCase()}`}
                </p>
                <p className="text-sm text-muted-foreground">Placed {when(order.createdAt)}</p>
              </div>

              <div className="text-right">
                <p className={`font-medium capitalize ${STATUS_TONE[order.status] || ''}`}>
                  {String(order.status || '').replace(/_/g, ' ')}
                </p>
                <p className="text-sm text-muted-foreground">{money(order.totalAmount)}</p>
              </div>
            </div>

            <ul className="mt-3 flex flex-wrap gap-3">
              {items.map((item) => (
                <li key={item._id || item.productId._id} className="flex items-center gap-2">
                  <div className="relative h-12 w-12 overflow-hidden rounded-md bg-muted">
                    {item.productId.images?.[0] && (
                      <Image
                        src={item.productId.images[0]}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="text-sm">
                    <Link
                      href={`/products/${item.productId.slug || item.productId._id}`}
                      className="hover:text-brand-ink"
                    >
                      {item.productId.name}
                    </Link>
                    <span className="block text-muted-foreground">
                      {item.quantity} x {money(item.price)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center gap-4 text-sm">
              <Link href={`/orders/${order._id}`} className="text-brand-ink hover:underline">
                Track and manage
              </Link>
              <span className="text-muted-foreground">
                {order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
