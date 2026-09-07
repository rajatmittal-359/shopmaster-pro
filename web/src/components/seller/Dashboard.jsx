'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';

/**
 * What a seller needs to know before they do anything else.
 *
 * WHY LOW STOCK IS A LIST AND NOT A NUMBER
 *   "3 products low" is a fact nobody can act on. The names are what get
 *   somebody to reorder, and the count of what is left is what tells them how
 *   urgent it is. The job that emails about this uses the same threshold.
 *
 * WHY THERE IS NO CHART
 *   One number of revenue and one queue of orders is what a shop this size
 *   acts on. A chart of four orders is decoration, and it would be the only
 *   thing on the page that needed a library.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function SellerDashboard() {
  const [data, setData] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [pending, setPending] = useState(null);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [analytics, low, orders] = await Promise.all([
          authedFetch('/seller/analytics'),
          authedFetch('/seller/products/low-stock'),
          authedFetch('/seller/orders'),
        ]);
        if (cancelled) return;

        setData(analytics);
        setLowStock(low.products || low || []);
        // What is actually waiting on the seller today - not the whole history.
        setPending(
          (orders.orders || []).filter((o) => ['pending', 'processing'].includes(o.status)).length
        );
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;
  if (state.status === 'error') return <p className="text-destructive">{state.message}</p>;

  const cards = [
    ['To pack today', pending, '/seller/orders', 'Orders waiting on you'],
    ['Products live', data?.products?.active, '/seller/products', `${data?.products?.total || 0} in total`],
    ['Earned so far', money(data?.revenue), '/seller/orders', 'Paid orders, your lines only'],
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(([label, value, href, note]) => (
          <Link
            key={label}
            href={href}
            className="rounded-xl border border-border p-4 transition hover:border-primary"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value ?? '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="font-semibold">Running low</h2>
        {lowStock.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing is close to running out.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {lowStock.map((product) => (
              <li key={product._id} className="flex items-center justify-between p-3 text-sm">
                <Link href={`/seller/products`} className="hover:text-brand-ink">
                  {product.name}
                </Link>
                <span className={product.stock === 0 ? 'text-destructive' : 'text-muted-foreground'}>
                  {product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
