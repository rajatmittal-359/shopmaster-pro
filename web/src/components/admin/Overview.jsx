'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';

/**
 * The platform at a glance.
 *
 * WHAT "REVENUE" MEANS HERE, AND WHY IT IS NOT WHAT CUSTOMERS SPENT
 *   The API sends `revenue` as COMMISSION - the platform's own take - and
 *   `grossSales` separately. They are labelled that way on screen for a reason:
 *   reading the basket total as income is how a marketplace convinces itself it
 *   is ten times the size it is, and then makes decisions on that number.
 *
 * THE BAR CHART IS DIVS
 *   Seven days of totals does not need a charting library. A library here would
 *   be the largest download on the page, for a picture of seven numbers.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function Overview() {
  const [data, setData] = useState(null);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const analytics = await authedFetch('/admin/analytics');
        if (cancelled) return;
        setData(analytics);
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

  const peak = Math.max(1, ...(data.revenueByDay || []).map((d) => d.total));

  const cards = [
    ['Commission earned', money(data.revenue), 'What the platform keeps'],
    ['Sold through the shop', money(data.grossSales), 'Customers paid this in total'],
    ['Orders', data.orders, `${data.ordersToday} in the last 24 hours`],
    ['Sellers', data.sellers?.total, `${data.sellers?.pending || 0} waiting to be approved`],
    ['Products', data.products, 'Live and hidden together'],
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(([label, value, note]) => (
          <div key={label} className="rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value ?? '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>

      {(data.revenueByDay || []).length > 0 && (
        <section>
          <h2 className="font-semibold">The last seven days</h2>
          <ul className="mt-3 space-y-2">
            {data.revenueByDay.map((day) => (
              <li key={day.date} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground">{day.date}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
                  <span
                    className="block h-full bg-primary"
                    style={{ width: `${Math.round((day.total / peak) * 100)}%` }}
                  />
                </span>
                <span className="w-28 text-right">
                  {money(day.total)} · {day.orders}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(data.topSellers || []).length > 0 && (
        <section>
          <h2 className="font-semibold">Selling the most</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {data.topSellers.map((seller) => (
              <li key={seller._id} className="flex justify-between p-3 text-sm">
                <span>{seller.name || seller.sellerName}</span>
                <span className="text-muted-foreground">
                  {money(seller.revenue)} · {seller.itemsSold} item(s)
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(data.lowStockGlobal || []).length > 0 && (
        <section>
          <h2 className="font-semibold">Running out, across every seller</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {data.lowStockGlobal.map((product) => (
              <li key={product._id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                <span>
                  {product.name}
                  <span className="text-muted-foreground"> · {product.sellerName}</span>
                </span>
                <span className={product.stock === 0 ? 'text-destructive' : 'text-muted-foreground'}>
                  {product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Anything waiting on you is in{' '}
        <Link href="/admin/orders" className="text-brand-ink hover:underline">
          Orders and disputes
        </Link>
        .
      </p>
    </div>
  );
}
