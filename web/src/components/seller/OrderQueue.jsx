'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ActionDialog from '@/components/common/ActionDialog';
import PanelCard from '@/components/panel/PanelCard';

/**
 * The work queue. Everything a seller does in a day is here.
 *
 * THE SHAPE, FROM THE REFERENCES
 *   Shopify's Orders page and Amazon's Manage Orders both open on tabs that
 *   are stages of work - Unfulfilled / Unshipped first, because that is the
 *   pile - with a count on each, a search box for the order number a
 *   customer reads out on the phone, and one card per order that leads with
 *   the product picture. The tab lives in the URL so "To pack" can be linked
 *   from the dashboard and comes back after a refresh.
 *
 * WHY EVERY ORDER SHOWS THIS SELLER'S OWN STATUS
 *   In a split order the order-level status reflects the LEAST advanced seller.
 *   Showing that here would tell a seller who packed and shipped yesterday that
 *   they have not shipped. The API already sends the per-seller fulfilment
 *   status; this uses it and never the order's.
 *
 * WHY THE MONEY SHOWN IS NOT THE ORDER TOTAL
 *   In a split order the basket total is partly another seller's money.
 *   `sellerMoneyFor` sends what THIS seller is owed, and that is what is shown.
 *
 * BOOKING A COURIER SPENDS REAL MONEY
 *   Out of the Shiprocket wallet, on a press. So it is a button with a
 *   confirmation, never something that happens because a status changed.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const when = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const WAITING = ['pending', 'processing'];
const CLOSED = ['delivered', 'cancelled', 'returned'];

const TABS = [
  { id: 'pack', label: 'To pack', test: (o) => WAITING.includes(o.status) && !o.shippingAwb },
  { id: 'shipped', label: 'Shipped', test: (o) => Boolean(o.shippingAwb) && !CLOSED.includes(o.status) },
  { id: 'returns', label: 'Returns', test: (o) => ['requested', 'picked'].includes(o.returnStage) },
  { id: 'all', label: 'All', test: () => true },
];

const EMPTY = {
  pack: 'Nothing to pack. New orders land here the moment they are paid.',
  shipped: 'Nothing is on its way right now.',
  returns: 'No returns or exchanges are open.',
  all: 'No orders yet. They appear here the moment a customer pays.',
};

/** The seller's own status, said in words, with a colour that agrees with it. */
function StatusBadge({ order }) {
  const s = order.status;
  if (['requested', 'picked'].includes(order.returnStage)) {
    return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">{order.returnResolution === 'replacement' ? 'Exchange open' : 'Return open'}</Badge>;
  }
  if (s === 'cancelled') return <Badge variant="destructive">Cancelled</Badge>;
  if (s === 'delivered') return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Delivered</Badge>;
  if (s === 'returned') return <Badge variant="outline">Returned</Badge>;
  if (order.shippingAwb || s === 'shipped') return <Badge className="bg-sky-500/10 text-sky-700 dark:text-sky-300">Shipped</Badge>;
  return <Badge className="bg-primary/10 text-brand-ink">To pack</Badge>;
}

export default function OrderQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'pack';

  const [orders, setOrders] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState('');
  // { kind: 'ship' | 'refuse' | 'cancel', order }
  const [asking, setAsking] = useState(null);

  const load = useCallback(async () => {
    const data = await authedFetch('/seller/orders');
    setOrders(data.orders || []);
    setState({ status: 'idle' });
  }, []);

  const retry = () => load().catch((err) => setState({ status: 'error', message: err.message }));

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/orders')
      .then((data) => {
        if (cancelled) return;
        setOrders(data.orders || []);
        setState({ status: 'idle' });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'pack') next.delete('tab');
    else next.set('tab', id);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.id, orders.filter(t.test).length])),
    [orders]
  );

  const shown = useMemo(() => {
    const test = TABS.find((t) => t.id === tab).test;
    const needle = q.trim().toLowerCase();
    return orders.filter(test).filter((o) => {
      if (!needle) return true;
      const hay = [o.orderNumber, o.customerId?.name, ...(o.items || []).map((i) => i.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [orders, tab, q]);

  const act = async (orderId, path, body, method = 'POST') => {
    setBusy(orderId);
    try {
      await authedFetch(`/seller/orders/${orderId}${path}`, { method, body });
      await load();
    } catch (err) {
      // The server's own words: "wallet balance too low", "pickup address not
      // set". Replacing those with "something went wrong" would leave a seller
      // pressing the same button all afternoon.
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (state.status === 'loading') return <QueueSkeleton />;
  if (state.status === 'error') {
    return (
      <PanelCard>
        <p className="text-sm text-destructive">{state.message}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </PanelCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Order stage" className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition ${
                  active ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                <span className={`tabular-nums ${active ? 'text-brand-ink' : ''}`}>{counts[t.id]}</span>
              </button>
            );
          })}
        </div>

        <label className="flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-3 sm:w-64">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order number, customer or item"
            aria-label="Search orders"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <PanelCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            {q.trim() ? `Nothing here matches “${q.trim()}”.` : EMPTY[tab]}
          </p>
        </PanelCard>
      ) : (
        <ul className="space-y-4">
          {shown.map((order) => {
            const working = busy === order._id;
            const shipped = Boolean(order.shippingAwb);

            return (
              <li key={order._id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/seller/orders/${order._id}`}
                        className="font-medium tabular-nums hover:text-brand-ink hover:underline"
                      >
                        {order.orderNumber || String(order._id).slice(-6).toUpperCase()}
                      </Link>
                      <StatusBadge order={order} />
                      {order.isSplitOrder && (
                        <span className="text-xs text-muted-foreground">shared order · your items only</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {order.customerId?.name || 'Customer'} · {when(order.createdAt)} ·{' '}
                      {order.paymentMethod === 'cod' ? 'Collect cash at the door' : 'Paid online'}
                    </p>
                  </div>

                  {/*
                    The seller's OWN earning, not the basket total - in a split
                    order that total is partly somebody else's money. The
                    commission is shown beside it rather than quietly deducted,
                    because a number that appears smaller than expected with no
                    explanation is how a seller stops trusting the platform.
                  */}
                  <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums">{money(order.sellerEarning)}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.sellerCommission > 0
                        ? `${money(order.sellerSubtotal)} less ${money(order.sellerCommission)} commission`
                        : 'to you'}
                    </p>
                  </div>
                </div>

                <ul className="mt-4 divide-y rounded-lg border">
                  {(order.items || []).map((item) => (
                    <li key={item._id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {item.image && (
                          <Image src={item.image} alt="" fill unoptimized className="object-cover" sizes="40px" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 line-clamp-2">{item.name}</span>
                      <span className="shrink-0 text-right">
                        <span className="block tabular-nums">{money(item.price * item.quantity)}</span>
                        <span className="block text-xs tabular-nums text-muted-foreground">× {item.quantity}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {shipped && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {order.shippingCourierName || 'Courier'} · <span className="tabular-nums">{order.shippingAwb}</span>
                  </p>
                )}

                {/* The courier refused, and the reason is the only useful thing
                    here - a seller cannot act on "booking failed". */}
                {order.bookingFailedReason && (
                  <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    Courier booking failed: {order.bookingFailedReason}
                  </p>
                )}

                {order.returnStage && (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    <p>
                      <strong>
                        {order.returnResolution === 'replacement' ? 'Exchange asked for' : 'Return asked for'}
                      </strong>{' '}
                      · {order.returnStage}
                    </p>
                    {order.returnReason && <p className="mt-1 text-muted-foreground">{order.returnReason}</p>}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {order.returnStage === 'requested' && (
                        <Button
                          onClick={() => act(order._id, '/return', { action: 'pickup' })}
                          disabled={working}
                          variant="outline"
                          size="sm"
                        >
                          Book the pickup
                        </Button>
                      )}
                      {['requested', 'picked'].includes(order.returnStage) && (
                        <>
                          <Button
                            onClick={() => act(order._id, '/return', { action: 'receive' })}
                            disabled={working}
                            variant="outline"
                            size="sm"
                          >
                            {order.returnResolution === 'replacement'
                              ? 'Got it back - send the replacement'
                              : 'Got it back - refund'}
                          </Button>
                          <Button
                            onClick={() => setAsking({ kind: 'refuse', order })}
                            disabled={working}
                            variant="outline"
                            size="sm"
                          >
                            Refuse it
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {!shipped && WAITING.includes(order.status) && (
                    <Button onClick={() => setAsking({ kind: 'ship', order })} disabled={working}>
                      {working ? 'Working…' : 'Book courier and ship'}
                    </Button>
                  )}

                  {shipped && order.status !== 'delivered' && (
                    <Button
                      onClick={() => act(order._id, '/ship/cancel')}
                      disabled={working}
                      variant="outline"
                      size="sm"
                    >
                      Cancel the shipment
                    </Button>
                  )}

                  {/* Only where the API says this seller may - a hand delivery
                      with no courier to ask. It puts the seller's own word on
                      record, and the customer is asked to confirm it. */}
                  {order.canDeclareDelivered && (
                    <Button
                      onClick={() => act(order._id, '/status', { status: 'delivered' }, 'PATCH')}
                      disabled={working}
                      variant="outline"
                      size="sm"
                    >
                      I delivered this myself
                    </Button>
                  )}

                  {WAITING.includes(order.status) && !shipped && (
                    <Button
                      onClick={() => setAsking({ kind: 'cancel', order })}
                      disabled={working}
                      variant="ghost"
                      size="sm"
                    >
                      Cancel my items
                    </Button>
                  )}

                  <Link
                    href={`/seller/orders/${order._id}`}
                    className="ml-auto text-sm text-brand-ink hover:underline"
                  >
                    Open this order
                  </Link>
                </div>

                {/*
                  Said in words, not a state name. "awaiting_delivery" means
                  nothing to the person waiting for the money; "after it is
                  delivered, plus 7 days" is the actual answer to the question
                  they are asking.
                */}
                {order.payout && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {order.payout.releasesAt
                      ? `Payout released on ${when(order.payout.releasesAt)}`
                      : order.payout.state === 'awaiting_delivery'
                        ? `Paid out ${order.payout.returnWindowDays} days after delivery - the return window has to close first`
                        : `Payout: ${String(order.payout.state).replace(/_/g, ' ')}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Three actions, one dialog. Booking a courier is the only one that is not
        destructive but IS irreversible in the way that matters - it spends real
        money out of the Shiprocket wallet - so it is confirmed without being
        painted red.
      */}
      <ActionDialog
        open={Boolean(asking)}
        onOpenChange={(next) => setAsking(next ? asking : null)}
        title={
          asking?.kind === 'ship'
            ? 'Book the courier'
            : asking?.kind === 'refuse'
              ? 'Refuse this return'
              : 'Cancel your items'
        }
        description={
          asking?.kind === 'ship'
            ? 'A pickup is booked and the cost comes out of the Shiprocket wallet. Have the parcel packed before you press this.'
            : asking?.kind === 'refuse'
              ? 'The customer is told, and they can dispute it - the platform then decides and its decision is final.'
              : 'The customer is refunded for your items and told why. Their other sellers are unaffected.'
        }
        reasons={
          asking?.kind === 'ship'
            ? []
            : asking?.kind === 'refuse'
              ? [
                  'It never came back',
                  'It came back used or damaged',
                  'A different item was sent back',
                  'It was asked for after the return window closed',
                ]
              : [
                  'It is out of stock',
                  'It was damaged in storage',
                  'The price or the listing was wrong',
                  'I cannot deliver to that address',
                ]
        }
        requireReason={asking?.kind !== 'ship'}
        destructive={asking?.kind === 'cancel'}
        confirmLabel={
          asking?.kind === 'ship'
            ? 'Book it'
            : asking?.kind === 'refuse'
              ? 'Refuse the return'
              : 'Cancel my items'
        }
        busy={busy === asking?.order?._id}
        note={asking?.kind === 'ship' ? undefined : 'The customer reads this.'}
        onConfirm={(reason) => {
          const { kind, order } = asking;
          setAsking(null);
          if (kind === 'ship') act(order._id, '/ship');
          else if (kind === 'refuse') act(order._id, '/return', { action: 'reject', reason });
          else act(order._id, '/cancel', { reason });
        }}
      />
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="skeleton-in space-y-4" aria-busy="true" aria-label="Loading orders">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-80 rounded-lg" />
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-7 w-20" />
          </div>
          <Skeleton className="mt-4 h-14 w-full rounded-lg" />
          <Skeleton className="mt-4 h-9 w-44 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
