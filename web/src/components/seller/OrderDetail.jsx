'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { money } from '@/lib/money';
import { orderRef } from '@/lib/orderRef';
import { Button } from '@/components/ui/button';
import ActionDialog from '@/components/common/ActionDialog';

/**
 * One order, from the seller's side.
 *
 * WHAT THIS SHOWS THAT THE QUEUE DOES NOT
 *   The delivery address, the dispute in full, and the payout state in words.
 *   The queue is for working through the day; this is for the order somebody
 *   has rung up about.
 *
 * EVERYTHING IS SCOPED BY THE SERVER
 *   `items` are this seller's lines only and the money is theirs alone - in a
 *   split order the basket belongs to two people. Nothing here re-derives
 *   either, so a seller can never see another's.
 */
const when = (iso, withTime = false) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
      })
    : '';

export default function SellerOrderDetail({ orderId }) {
  const [order, setOrder] = useState(null);
  const [state, setState] = useState({ status: 'loading' });
  const [booking, setBooking] = useState(false);

  const load = async () => {
    const data = await authedFetch(`/seller/orders/${orderId}`);
    setOrder(data.order);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch(`/seller/orders/${orderId}`);
        if (cancelled) return;
        setOrder(data.order);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const act = async (path, body, method = 'POST') => {
    setState({ status: 'working' });
    try {
      await authedFetch(`/seller/orders/${orderId}${path}`, { method, body });
      await load();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;
  if (!order) return <p className="text-destructive">{state.message || 'Not found'}</p>;

  const address = order.shippingAddressId;
  const shipped = Boolean(order.shippingAwb);

  return (
    <div className="max-w-3xl space-y-6">
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <header className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{orderRef(order)}</h1>
            <p className="text-sm text-muted-foreground">
              {order.customerId?.name} · {order.customerId?.email} · {when(order.createdAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-medium capitalize">{order.status}</p>
            <p className="text-sm text-muted-foreground">
              {money(order.sellerEarning)} to you
              {order.sellerCommission > 0
                ? ` · ${money(order.sellerSubtotal)} less ${money(order.sellerCommission)} commission`
                : ''}
            </p>
            <p className="text-sm font-medium">
              {order.paymentMethod === 'cod' ? 'Collect cash at the door' : 'Paid online'}
            </p>
          </div>
        </div>

        {order.isSplitOrder && (
          <p className="mt-2 text-xs text-muted-foreground">
            This basket has more than one seller in it. Everything on this page is
            your part of it.
          </p>
        )}
      </header>

      <section className="rounded-xl border border-border p-4">
        <h2 className="font-semibold">What to pack</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(order.items || []).map((item) => (
            <li key={item._id}>
              {item.name} × {item.quantity} — {money(item.price * item.quantity)}
              {item.status === 'cancelled' && (
                <span className="text-muted-foreground"> · cancelled</span>
              )}
            </li>
          ))}
        </ul>

        {address && (
          <>
            <h2 className="mt-4 font-semibold">Where it goes</h2>
            <address className="mt-1 text-sm not-italic leading-6 text-muted-foreground">
              {address.street}
              <br />
              {address.city}, {address.state} {address.zipCode}
              <br />
              {address.phoneNumber}
            </address>
          </>
        )}

        {shipped && (
          <p className="mt-4 text-sm">
            {order.shippingCourierName || 'Courier'} · {order.shippingAwb}
          </p>
        )}

        {order.bookingFailedReason && (
          <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Courier booking failed ({order.bookingAttempts} attempt
            {order.bookingAttempts === 1 ? '' : 's'}): {order.bookingFailedReason}
          </p>
        )}
      </section>

      {(order.returnStage || order.disputeStatus) && (
        <section className="rounded-xl border border-border p-4 text-sm">
          <h2 className="font-semibold">
            {order.returnResolution === 'replacement' ? 'Exchange' : 'Return'}
          </h2>

          {order.returnStage && (
            <p className="mt-2">
              Stage: <strong>{order.returnStage}</strong>
              {order.returnAwb ? ` · pickup ${order.returnAwb}` : ''}
              {order.returnBookedAt ? ` · booked ${when(order.returnBookedAt)}` : ''}
            </p>
          )}
          {order.returnReason && (
            <p className="mt-1 text-muted-foreground">The customer wrote: {order.returnReason}</p>
          )}
          {order.replacementStage && (
            <p className="mt-1">
              Replacement: <strong>{order.replacementStage}</strong>
              {order.replacementBookedAt ? ` · sent ${when(order.replacementBookedAt)}` : ''}
            </p>
          )}

          {order.disputeStatus && (
            <div className="mt-3 rounded-lg border border-border p-3">
              <p>
                Dispute: <strong>{order.disputeStatus}</strong>
              </p>
              {order.disputeReason && (
                <p className="mt-1 text-muted-foreground">{order.disputeReason}</p>
              )}
              {order.disputeResolution && (
                <p className="mt-1">The platform decided: {order.disputeResolution}</p>
              )}
              {order.disputeStatus === 'open' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Only the platform can settle this. Your payout for these items is
                  held until it does.
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {order.returnStage === 'requested' && (
              <Button size="sm" onClick={() => act('/return', { action: 'pickup' })}>
                Book the pickup
              </Button>
            )}
            {['requested', 'picked'].includes(order.returnStage) && (
              <Button variant="outline" size="sm" onClick={() => act('/return', { action: 'receive' })}>
                {order.returnResolution === 'replacement'
                  ? 'Got it back - send the replacement'
                  : 'Got it back - refund'}
              </Button>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border p-4">
        <h2 className="font-semibold">What you can do</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {!shipped && ['pending', 'processing'].includes(order.status) && (
            <Button
              onClick={() => setBooking(true)}
            >
              Book courier and ship
            </Button>
          )}
          {shipped && order.status !== 'delivered' && (
            <Button variant="outline" size="sm" onClick={() => act('/ship/cancel')}>
              Cancel the shipment
            </Button>
          )}
          {order.canDeclareDelivered && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => act('/status', { status: 'delivered' }, 'PATCH')}
            >
              I delivered this myself
            </Button>
          )}
        </div>

        {order.payout && (
          <p className="mt-3 text-xs text-muted-foreground">
            {order.payout.releasesAt
              ? `Payout released on ${when(order.payout.releasesAt)}`
              : `Paid out ${order.payout.returnWindowDays} days after delivery - the return window has to close first`}
          </p>
        )}

        <p className="mt-4 text-sm">
          <Link href="/seller/orders" className="text-brand-ink hover:underline">
            Back to the queue
          </Link>
        </p>
      </section>

      <ActionDialog
        open={booking}
        onOpenChange={setBooking}
        title="Book the courier"
        description="A pickup is booked and the cost comes out of the Shiprocket wallet. Have the parcel packed before you press this."
        confirmLabel="Book it"
        busy={state.status === 'working'}
        onConfirm={() => {
          setBooking(false);
          act('/ship');
        }}
      />
    </div>
  );
}
