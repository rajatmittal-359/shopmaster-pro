'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';

/**
 * The work queue. Everything a seller does in a day is here.
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

export default function OrderQueue() {
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [busy, setBusy] = useState(null);

  const load = async () => {
    const data = await authedFetch('/seller/orders');
    setOrders(data.orders || []);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/seller/orders');
        if (cancelled) return;
        setOrders(data.orders || []);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const act = async (orderId, path, body, method = 'POST') => {
    setBusy(orderId);
    setState({ status: 'idle' });
    try {
      await authedFetch(`/seller/orders/${orderId}${path}`, { method, body });
      await load();
    } catch (err) {
      // The server's own words: "wallet balance too low", "pickup address not
      // set". Replacing those with "something went wrong" would leave a seller
      // pressing the same button all afternoon.
      setState({ status: 'error', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  if (orders.length === 0) {
    return <p className="text-muted-foreground">No orders yet.</p>;
  }

  const button =
    'rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60';

  return (
    <div className="space-y-4">
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <ul className="space-y-4">
        {orders.map((order) => {
          const working = busy === order._id;
          const shipped = Boolean(order.shippingAwb);

          return (
            <li key={order._id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {order.orderNumber || String(order._id).slice(-6).toUpperCase()}
                    {order.isSplitOrder && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (shared order - your items only)
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.customerId?.name || 'Customer'} · {when(order.createdAt)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-medium capitalize">{order.status}</p>
                  {/*
                    The seller's OWN earning, not the basket total - in a split
                    order that total is partly somebody else's money. The
                    commission is shown beside it rather than quietly deducted,
                    because a number that appears smaller than expected with no
                    explanation is how a seller stops trusting the platform.
                  */}
                  <p className="text-sm text-muted-foreground">
                    {money(order.sellerEarning)} to you
                    {order.sellerCommission > 0 &&
                      ` · ${money(order.sellerSubtotal)} less ${money(order.sellerCommission)} commission`}
                  </p>
                  <p className="text-sm font-medium">
                    {order.paymentMethod === 'cod' ? 'Collect cash at the door' : 'Paid online'}
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm">
                {(order.items || []).map((item) => (
                  <li key={item._id}>
                    {item.name} × {item.quantity} — {money(item.price * item.quantity)}
                  </li>
                ))}
              </ul>

              {shipped && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {order.shippingCourierName || 'Courier'} · {order.shippingAwb}
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
                <div className="mt-3 rounded-lg border border-border p-3 text-sm">
                  <p>
                    <strong>
                      {order.returnResolution === 'replacement'
                        ? 'Exchange asked for'
                        : 'Return asked for'}
                    </strong>{' '}
                    · {order.returnStage}
                  </p>
                  {order.returnReason && (
                    <p className="mt-1 text-muted-foreground">{order.returnReason}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.returnStage === 'requested' && (
                      <Button
                        onClick={() => act(order._id, '/return', { action: 'pickup' })}
                        disabled={working}
                        className={button} variant="outline" size="sm">
                        Book the pickup
                      </Button>
                    )}
                    {['requested', 'picked'].includes(order.returnStage) && (
                      <>
                        <Button
                          onClick={() => act(order._id, '/return', { action: 'receive' })}
                          disabled={working}
                          className={button} variant="outline" size="sm">
                          {order.returnResolution === 'replacement'
                            ? 'Got it back - send the replacement'
                            : 'Got it back - refund'}
                        </Button>
                        <Button
                          onClick={() => {
                            const reason = window.prompt(
                              'Why are you refusing this return? The customer can dispute it, so be specific.'
                            );
                            if (reason) act(order._id, '/return', { action: 'reject', reason });
                          }}
                          disabled={working}
                          className={button} variant="outline" size="sm">
                          Refuse it
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {!shipped && ['pending', 'processing'].includes(order.status) && (
                  <Button
                    onClick={() => {
                      // Booking spends from the Shiprocket wallet. Asked once,
                      // out loud, because there is no undo that costs nothing.
                      if (window.confirm('Book the courier for this parcel now?')) {
                        act(order._id, '/ship');
                      }
                    }}
                    disabled={working}>
                    {working ? 'Working…' : 'Book courier and ship'}
                  </Button>
                )}

                {shipped && order.status !== 'delivered' && (
                  <Button
                    onClick={() => act(order._id, '/ship/cancel')}
                    disabled={working}
                    className={button} variant="outline" size="sm">
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
                    className={button} variant="outline" size="sm">
                    I delivered this myself
                  </Button>
                )}

                {['pending', 'processing'].includes(order.status) && !shipped && (
                  <Button
                    onClick={() => {
                      const reason = window.prompt('Why are you cancelling? The customer is told.');
                      if (reason) act(order._id, '/cancel', { reason });
                    }}
                    disabled={working}
                    className={button} variant="outline" size="sm">
                    Cancel my items
                  </Button>
                )}
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
    </div>
  );
}
