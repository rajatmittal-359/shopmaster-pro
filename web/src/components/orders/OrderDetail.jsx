'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { readable, hasLeftTheSeller } from '@/lib/courierText';

/**
 * One order: where each parcel is, and what can still be done about it.
 *
 * WHAT THIS PAGE IS FOR
 *   An order here can be two parcels from two sellers, moving at different
 *   speeds. So it is drawn per PARCEL, not as one status - the customer needs
 *   to know that one arrived on Tuesday and the other is still with the seller.
 *
 * EVERY BUTTON IS DRAWN FROM THE SERVER'S ANSWER
 *   `canCancel` and `canReturn` come with the order. The old page decided for
 *   itself and offered Cancel on shipped parcels the API then refused - a
 *   button that promises something impossible is worse than no button.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const when = (iso, withTime = false) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });

export default function OrderDetail({ orderId }) {
  const { signedIn } = useSession();
  const [data, setData] = useState(null);
  const [state, setState] = useState({ status: 'loading' });
  const [returning, setReturning] = useState(false);
  const [returnForm, setReturnForm] = useState({ reason: '', resolution: 'refund' });

  const load = async () => {
    const fresh = await authedFetch(`/customer/orders/${orderId}`);
    setData(fresh);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const fresh = await authedFetch(`/customer/orders/${orderId}`);
        if (cancelled) return;
        setData(fresh);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, orderId]);

  const act = async (path, body, method = 'POST') => {
    setState({ status: 'working' });
    try {
      await authedFetch(path, { method, body });
      // Always re-read. The server may have done something slightly different
      // from what was asked - cancelled one parcel of two, say - and what it
      // actually did is the only thing worth showing.
      await load();
      setReturning(false);
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (!signedIn) {
    return (
      <p className="text-muted-foreground">
        <Link href={`/login?next=${encodeURIComponent(`/orders/${orderId}`)}`} className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to see this order.
      </p>
    );
  }

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-destructive">{state.message || 'Order not found'}</p>;

  const { order, canCancel, canReturn, returnWindowClosesAt } = data;
  const address = order.shippingAddressId;

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">
              {order.orderNumber || `Order ${String(order._id).slice(-6).toUpperCase()}`}
            </h1>
            <p className="text-sm text-muted-foreground">Placed {when(order.createdAt)}</p>
          </div>
          <div className="text-right">
            <p className="font-medium capitalize">{String(order.status).replace(/_/g, ' ')}</p>
            <p className="text-sm text-muted-foreground">
              {money(order.totalAmount)} ·{' '}
              {order.paymentMethod === 'cod'
                ? 'Cash on delivery'
                : `Paid online${order.paymentStatus ? ` (${order.paymentStatus})` : ''}`}
            </p>
          </div>
        </div>

        {address && (
          <p className="mt-3 text-sm text-muted-foreground">
            Delivering to {address.street}, {address.city}, {address.state} {address.zipCode}
          </p>
        )}
      </header>

      {/* One block per parcel. A split order is two sellers, two couriers and
          two dates, and flattening that into a single line is how a customer
          ends up believing the whole order is late. */}
      {(order.fulfilments || []).map((parcel, index) => {
        const items = (order.items || []).filter(
          (item) => String(item.sellerId) === String(parcel.sellerId)
        );
        const moving = hasLeftTheSeller(parcel.scans);

        return (
          <section key={parcel._id || index} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                {order.fulfilments.length > 1 ? `Parcel ${index + 1}` : 'Your parcel'}
              </h2>
              <p className="text-sm capitalize text-muted-foreground">
                {parcel.status}
                {parcel.deliveredAt ? ` on ${when(parcel.deliveredAt)}` : ''}
              </p>
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {items.map((item) => (
                <li key={item._id}>
                  {item.name} × {item.quantity} — {money(item.price * item.quantity)}
                </li>
              ))}
            </ul>

            {parcel.awb && (
              <p className="mt-3 text-sm">
                {parcel.courierName || 'Courier'} · {parcel.awb}
                {parcel.trackingUrl && (
                  <>
                    {' '}
                    <a
                      href={parcel.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-ink hover:underline"
                    >
                      Track it
                    </a>
                  </>
                )}
              </p>
            )}

            {/* The courier's own words, not our summary of them. "Address issue
                - customer not available" is something a person can act on;
                "shipped" is not. */}
            {parcel.scans?.length > 0 && (
              <ol className="mt-3 space-y-1 border-l border-border pl-4 text-sm text-muted-foreground">
                {[...parcel.scans]
                  .slice(-6)
                  .reverse()
                  .map((scan, i) => (
                    <li key={`${scan.at}-${i}`}>
                      {readable(scan.activity)}
                      {scan.location ? ` · ${scan.location}` : ''}
                      {scan.at ? ` · ${when(scan.at, true)}` : ''}
                    </li>
                  ))}
              </ol>
            )}

            {parcel.awb && !moving && parcel.status === 'shipped' && (
              // Said plainly rather than left to look like a stalled parcel.
              <p className="mt-3 text-sm text-muted-foreground">
                The courier has the label but has not picked it up yet.
              </p>
            )}

            {parcel.returnStage && (
              <p className="mt-3 text-sm">
                Return: <strong className="capitalize">{parcel.returnStage}</strong>
                {parcel.returnResolution === 'replacement' && ' · a replacement is being sent'}
              </p>
            )}
          </section>
        );
      })}

      <section className="rounded-xl border border-border p-4">
        <h2 className="font-semibold">What you can do</h2>

        <div className="mt-3 flex flex-wrap gap-3">
          {canCancel && (
            <button
              onClick={() => act(`/customer/orders/${orderId}/cancel`, undefined, 'PATCH')}
              disabled={state.status === 'working'}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
            >
              Cancel this order
            </button>
          )}

          {canReturn && !returning && (
            <button
              onClick={() => setReturning(true)}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              Return or exchange
            </button>
          )}

          {/* Only where the seller says they delivered it themselves and no
              courier can be asked. Confirming ends the hold on their payout,
              which is why it is the customer's to press. */}
          {order.fulfilments?.some(
            (f) => f.status === 'delivered' && f.deliveryConfirmedBy === 'seller'
          ) && (
            <button
              onClick={() => act(`/customer/orders/${orderId}/confirm-receipt`)}
              disabled={state.status === 'working'}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
            >
              Yes, I received it
            </button>
          )}
        </div>

        {canReturn && returnWindowClosesAt && !returning && (
          <p className="mt-3 text-sm text-muted-foreground">
            You can ask until {when(returnWindowClosesAt)}.
          </p>
        )}

        {returning && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(`/customer/orders/${orderId}/return`, returnForm);
            }}
            className="mt-4 space-y-3"
          >
            {/*
              The choice the exchange work added: money back, or the same item
              again. Asked here, once, because the seller's payout and the
              courier booking both depend on which one it is.
            */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">What would you like?</legend>
              {[
                ['refund', 'My money back', 'Refunded to the way you paid, once it reaches the seller'],
                ['replacement', 'The same item again', 'Nothing is refunded; the replacement is delivered free'],
              ].map(([value, label, note]) => (
                <label
                  key={value}
                  className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary"
                >
                  <input
                    type="radio"
                    name="resolution"
                    checked={returnForm.resolution === value}
                    onChange={() => setReturnForm({ ...returnForm, resolution: value })}
                    className="mt-1"
                  />
                  <span>
                    <strong>{label}</strong>
                    <span className="block text-muted-foreground">{note}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div>
              <label htmlFor="reason" className="text-sm font-medium">
                What went wrong?
              </label>
              <textarea
                id="reason"
                required
                minLength={3}
                rows={3}
                value={returnForm.reason}
                onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The seller reads this. A line is enough.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={state.status === 'working'}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {state.status === 'working' ? 'Sending…' : 'Send the request'}
              </button>
              <button
                type="button"
                onClick={() => setReturning(false)}
                className="text-sm text-muted-foreground"
              >
                Not now
              </button>
            </div>
          </form>
        )}

        <p aria-live="polite" className="mt-3 min-h-5 text-sm">
          {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
        </p>

        <p className="mt-3 text-sm text-muted-foreground">
          Something else wrong?{' '}
          <Link href="/contact" className="text-brand-ink hover:underline">
            Tell us
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
