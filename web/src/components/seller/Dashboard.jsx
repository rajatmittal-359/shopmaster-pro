'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Circle, IndianRupee, Package, Tag } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * What a seller needs to know before they do anything else.
 *
 * THE SHAPE, FROM THE REFERENCES
 *   Shopify's Home and Amazon's Seller Central both open the same way: three
 *   or four numbers that matter today, then the work itself - the orders
 *   waiting - then what is about to go wrong (stock). A new shop gets a setup
 *   guide instead of empty boxes. That is the whole page.
 *
 * WHY THE WAITING ORDERS ARE LISTED AND NOT COUNTED
 *   "3 to pack" sends the seller to another page to find out which three.
 *   The first few, with the customer and the money, let them start packing
 *   from here. Same reason low stock is names and not a number.
 *
 * WHY THERE IS NO CHART
 *   One number of revenue and one queue of orders is what a shop this size
 *   acts on. A chart of four orders is decoration, and it would be the only
 *   thing on the page that needed a library.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const WAITING = ['pending', 'processing'];

export default function SellerDashboard() {
  const [data, setData] = useState(null);
  const [state, setState] = useState({ status: 'loading' });

  // Fetching and showing are kept apart so the effect only subscribes to a
  // promise - the lint rule (and React) object to setState called straight
  // from an effect body, and "Try again" needs the same fetch anyway.
  const fetchAll = useCallback(async () => {
    const [analytics, low, orders, settings] = await Promise.all([
      authedFetch('/seller/analytics'),
      authedFetch('/seller/products/low-stock'),
      authedFetch('/seller/orders'),
      authedFetch('/seller/settings'),
    ]);
    const all = orders.orders || [];
    return {
      analytics,
      lowStock: low.products || low || [],
      waiting: all.filter((o) => WAITING.includes(o.status) && !o.shippingAwb),
      settings: settings.settings || {},
    };
  }, []);

  const load = () => {
    setState({ status: 'loading' });
    fetchAll()
      .then((next) => {
        setData(next);
        setState({ status: 'idle' });
      })
      .catch((err) => setState({ status: 'error', message: err.message }));
  };

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setState({ status: 'idle' });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  if (state.status === 'loading') return <DashboardSkeleton />;
  if (state.status === 'error') {
    return (
      <PanelCard>
        <p className="text-sm text-destructive">{state.message}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={load}>
          Try again
        </Button>
      </PanelCard>
    );
  }

  const { analytics, lowStock, waiting, settings } = data;
  const productsTotal = analytics?.products?.total || 0;
  const pickupSet = Boolean(settings.pickupAddress?.pincode);
  const setupDone = productsTotal > 0 && pickupSet;

  const cards = [
    { icon: Package, label: 'To pack', value: waiting.length, href: '/seller/orders?tab=pack', note: 'Orders waiting on you' },
    { icon: Tag, label: 'Products live', value: analytics?.products?.active ?? 0, href: '/seller/products', note: `${productsTotal} in total` },
    { icon: IndianRupee, label: 'Earned so far', value: money(analytics?.revenue), href: '/seller/earnings', note: 'Paid orders, your lines only' },
  ];

  return (
    <div className="space-y-6">
      {!setupDone && <SetupGuide productsTotal={productsTotal} pickupSet={pickupSet} />}

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {cards.map(({ icon: Icon, label, value, href, note }) => (
          <Link
            key={label}
            href={href}
            className="glow-hover group min-w-0 rounded-xl border bg-card p-3 transition hover:border-primary/40 sm:p-5"
          >
            <div className="hidden items-center justify-between sm:flex">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-brand-ink">
                <Icon className="size-4" />
              </span>
              <ArrowRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </div>
            <p className="text-xs text-muted-foreground sm:mt-4 sm:text-sm">{label}</p>
            <p className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value ?? '—'}</p>
            <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{note}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <PanelCard
          className="min-w-0 lg:col-span-3"
          title="Waiting on you"
          lead={waiting.length ? `${waiting.length} to pack and book a courier for.` : undefined}
          aside={
            waiting.length > 0 && (
              <Link href="/seller/orders?tab=pack" className="text-sm text-brand-ink hover:underline">
                All orders
              </Link>
            )
          }
        >
          {waiting.length === 0 ? (
            <Empty>Nothing is waiting. New orders land here the moment they are paid.</Empty>
          ) : (
            <ul className="divide-y">
              {waiting.slice(0, 5).map((order) => (
                <li key={order._id}>
                  <Link
                    href={`/seller/orders/${order._id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 text-sm transition hover:bg-accent/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium tabular-nums">
                        {order.orderNumber || String(order._id).slice(-6).toUpperCase()}
                      </p>
                      <p className="truncate text-muted-foreground">
                        {order.customerId?.name || 'Customer'} · {when(order.createdAt)} ·{' '}
                        {(order.items || []).map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium tabular-nums">{money(order.sellerEarning)}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.paymentMethod === 'cod' ? 'Cash at the door' : 'Paid online'}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard className="min-w-0 lg:col-span-2" title="Running low">
          {lowStock.length === 0 ? (
            <Empty>Nothing is close to running out.</Empty>
          ) : (
            <ul className="divide-y">
              {lowStock.map((product) => (
                <li key={product._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/seller/products/${product._id}`} className="min-w-0 truncate hover:text-brand-ink">
                    {product.name}
                  </Link>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 tabular-nums ${
                      product.stock === 0 ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    <Circle
                      className={`size-2 ${product.stock === 0 ? 'fill-destructive' : 'fill-amber-500 text-amber-500'}`}
                    />
                    {product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

/**
 * Shopify's setup guide, at our size: the two things a shop cannot sell
 * without. It goes away on its own once both are done.
 */
function SetupGuide({ productsTotal, pickupSet }) {
  const steps = [
    {
      done: pickupSet,
      title: 'Tell the courier where to collect',
      body: 'A pickup address is where the rider is sent. Without one, nothing can be shipped.',
      href: '/seller/settings',
      cta: 'Set the address',
    },
    {
      done: productsTotal > 0,
      title: 'List your first product',
      body: 'One photo is enough to start - the AI can write the listing and clean the picture.',
      href: '/seller/products/new',
      cta: 'Add a product',
    },
  ];
  const left = steps.filter((s) => !s.done).length;

  return (
    <PanelCard title="Set up your shop" lead={`${left} of ${steps.length} left to do.`}>
      <ol className="divide-y">
        {steps.map((step) => (
          <li key={step.title} className="flex items-start gap-3 py-3">
            <span
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                step.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
              }`}
              aria-hidden
            >
              {step.done && <Check className="size-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${step.done ? 'text-muted-foreground line-through' : ''}`}>{step.title}</p>
              {!step.done && (
                <>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
                  <Button size="sm" className="mt-3" nativeButton={false} render={<Link href={step.href} />}>
                    {step.cta}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </PanelCard>
  );
}

function Empty({ children }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function DashboardSkeleton() {
  return (
    <div className="skeleton-in space-y-6" aria-busy="true" aria-label="Loading your shop">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-5">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="mt-4 h-4 w-20" />
            <Skeleton className="mt-2 h-8 w-24" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="rounded-xl border bg-card p-5 lg:col-span-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-4 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <Skeleton className="h-5 w-28" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="mt-4 h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
