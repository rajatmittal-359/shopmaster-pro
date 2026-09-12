'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import ShipmentTimeline from '@/components/orders/ShipmentTimeline';
import ActionDialog from '@/components/common/ActionDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { POLICY } from '@/config/policy';

/**
 * One order: where each parcel is, and what can still be done about it.
 *
 * WHAT THIS PAGE IS FOR
 *   An order here can be two parcels from two sellers, moving at different
 *   speeds. So it is drawn per PARCEL, not as one status - the customer needs
 *   to know that one arrived on Tuesday and the other is still with the seller.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Amazon and Flipkart both keep every action NEXT TO the thing it acts on:
 *   Cancel on the item's own row, "Problem with order" on the shipment that
 *   has the problem, and a cancelled line says who cancelled it and why. The
 *   first version of this page had one "What you can do" box under everything,
 *   which in a two-parcel order left the customer guessing which parcel a
 *   button was about. Now: item actions on the item, parcel actions in the
 *   parcel, and only the return - which the API applies to the whole order
 *   once every parcel has arrived - sits below on its own.
 *
 * EVERY BUTTON IS DRAWN FROM THE SERVER'S ANSWER
 *   `canCancel`, `cancellableItemIds`, `canReturn` and `canDispute` come with
 *   the order. The old page decided for itself and offered Cancel on shipped
 *   parcels the API then refused - a button that promises something impossible
 *   is worse than no button.
 *
 * "SOMETHING'S WRONG" IS A DISPUTE, AND IT IS OFFERED ON DELIVERED PARCELS TOO
 *   Couriers mark parcels delivered that never arrived. Amazon's A-to-z exists
 *   for exactly that; ours stops the seller's payout and puts the disagreement
 *   in front of an admin. The categories are Amazon's, the free text is for
 *   the admin who has to settle it.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const when = (iso, withTime = false) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });

const WHO = { customer: 'you', seller: 'the seller', admin: 'ShopMaster Pro' };

// One source for the refund promise - the same numbers the refund policy page prints.
const REFUND_DAYS = `${POLICY.refundDays[0]}–${POLICY.refundDays[1]} working days`;

const DISPUTE_REASONS = [
  'It says delivered, but nothing came',
  'The wrong item, or a damaged one',
  'My return was refused',
];

/** The order's own status in words, and a colour that agrees with it. */
function StatusBadge({ status }) {
  const s = String(status || '');
  if (s === 'cancelled') return <Badge variant="destructive">Cancelled</Badge>;
  if (s === 'delivered') return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Delivered</Badge>;
  if (s === 'shipped') return <Badge className="bg-sky-500/10 text-sky-700 dark:text-sky-300">On its way</Badge>;
  if (s === 'returned') return <Badge variant="outline">Returned</Badge>;
  if (s === 'processing') return <Badge className="bg-primary/10 text-brand-ink">Being packed</Badge>;
  return <Badge className="bg-primary/10 text-brand-ink">{s.replace(/_/g, ' ') || 'Placed'}</Badge>;
}

export default function OrderDetail({ orderId }) {
  const { signedIn } = useSession();
  const [data, setData] = useState(null);
  const [state, setState] = useState({ status: 'loading' });
  const [returning, setReturning] = useState(false);
  const [returnForm, setReturnForm] = useState({ reason: '', resolution: 'refund' });
  // { kind: 'cancelOrder' | 'cancelItem' | 'dispute', item? }
  const [asking, setAsking] = useState(null);

  const load = async () => {
    const fresh = await authedFetch(`/customer/orders/${orderId}`);
    setData(fresh);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    authedFetch(`/customer/orders/${orderId}`)
      .then((fresh) => {
        if (cancelled) return;
        setData(fresh);
        setState({ status: 'idle' });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, orderId]);

  const act = async (path, body, method = 'POST', done) => {
    setState({ status: 'working' });
    try {
      const result = await authedFetch(path, { method, body });
      // Always re-read. The server may have done something slightly different
      // from what was asked - cancelled one parcel of two, say - and what it
      // actually did is the only thing worth showing.
      await load();
      setReturning(false);
      if (done) toast.success(done, { description: result?.message });
    } catch (err) {
      setState({ status: 'idle' });
      toast.error(err.message);
    }
  };

  if (state.status === 'loading') return <OrderSkeleton />;
  if (!data) return <p className="text-destructive">{state.message || 'Order not found'}</p>;

  const { order, canCancel, canReturn, canDispute, returnWindowClosesAt } = data;
  const cancellable = new Set(data.cancellableItemIds || []);
  const address = order.shippingAddressId;
  const working = state.status === 'working';
  const parcels = order.fulfilments || [];

  return (
    <div className="space-y-6">
      <header className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tabular-nums">
                {order.orderNumber || `Order ${String(order._id).slice(-6).toUpperCase()}`}
              </h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Placed {when(order.createdAt)}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">{money(order.totalAmount)}</p>
            <p className="text-sm text-muted-foreground">
              {order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}
            </p>
          </div>
        </div>

        {address && (
          <p className="mt-3 text-sm text-muted-foreground">
            Delivering to {address.street}, {address.city}, {address.state} {address.zipCode}
          </p>
        )}

        {/* Who cancelled, and why - Flipkart's grey band. The admin could
            always see this; the person it happened to could not. */}
        {order.status === 'cancelled' && (
          <p className="mt-3 rounded-lg bg-muted p-3 text-sm">
            Cancelled by {WHO[order.cancelledBy] || 'the platform'}
            {order.cancelledAt ? ` on ${when(order.cancelledAt)}` : ''}
            {order.cancellationReason ? ` - ${order.cancellationReason}` : ''}.
            {order.paymentMethod !== 'cod' && order.paymentStatus === 'paid' && (
              <span className="text-muted-foreground"> Your money goes back the way you paid, within {REFUND_DAYS}.</span>
            )}
          </p>
        )}

        {canCancel && (
          <div className="mt-4">
            <Button variant="outline" size="sm" disabled={working} onClick={() => setAsking({ kind: 'cancelOrder' })}>
              Cancel the whole order
            </Button>
          </div>
        )}
      </header>

      {/* One block per parcel. A split order is two sellers, two couriers and
          two dates, and flattening that into a single line is how a customer
          ends up believing the whole order is late. */}
      {parcels.map((parcel, index) => {
        const items = (order.items || []).filter((item) => String(item.sellerId) === String(parcel.sellerId));
        const arguable = canDispute && ['shipped', 'delivered'].includes(parcel.status);
        const awaitingMe = parcel.status === 'delivered' && parcel.deliveryConfirmedBy === 'seller';

        return (
          <section key={parcel._id || index} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{parcels.length > 1 ? `Parcel ${index + 1}` : 'Your parcel'}</h2>
              <p className="text-sm text-muted-foreground">
                <StatusBadge status={parcel.status} />
                {parcel.deliveredAt ? <span className="ml-2">on {when(parcel.deliveredAt)}</span> : null}
              </p>
            </div>

            <ul className="mt-4 divide-y rounded-lg border">
              {items.map((item) => {
                const product = item.productId && typeof item.productId === 'object' ? item.productId : null;
                const gone = item.status === 'cancelled';
                return (
                  <li key={item._id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {product?.images?.[0] && (
                        <Image src={product.images[0]} alt="" fill unoptimized className={`object-cover ${gone ? 'opacity-40' : ''}`} sizes="48px" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      {product?.slug ? (
                        <Link href={`/products/${product.slug}`} className={`line-clamp-2 hover:text-brand-ink ${gone ? 'text-muted-foreground line-through' : ''}`}>
                          {item.name}
                        </Link>
                      ) : (
                        <span className={`line-clamp-2 ${gone ? 'text-muted-foreground line-through' : ''}`}>{item.name}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {gone ? 'Cancelled' : `× ${item.quantity}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block tabular-nums ${gone ? 'text-muted-foreground line-through' : ''}`}>
                        {money(item.price * item.quantity)}
                      </span>
                      {cancellable.has(String(item._id)) && (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => setAsking({ kind: 'cancelItem', item })}
                          className="text-xs text-brand-ink hover:underline disabled:opacity-50"
                        >
                          Cancel this item
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            {parcel.awb && (
              <p className="mt-3 text-sm">
                {/* Carrier and a LINKED tracking number - two of the six. The
                    number is a link because people recognise it as one, and it
                    is the last resort rather than the first: everything above
                    is here so nobody has to leave. */}
                {parcel.courierName || 'Courier'} · <span className="tabular-nums">{parcel.awb}</span>
                {parcel.trackingUrl && (
                  <>
                    {' '}
                    <a href={parcel.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-brand-ink hover:underline">
                      Track it
                    </a>
                  </>
                )}
              </p>
            )}

            {/*
              The tracking view, built to what Baymard's order-tracking
              research says a customer is owed: the expected delivery date, a
              progress indicator, the carrier, a linked tracking number, the
              detailed history and what is in the parcel.
            */}
            <div className="mt-4">
              <ShipmentTimeline order={order} fulfilment={parcel} />
            </div>

            {/* Amazon says "delivery attempted" the moment the courier records
                it. Ours recorded it and said nothing, which is how "where is my
                parcel" calls start. */}
            {parcel.ndrReason && parcel.status !== 'delivered' && (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <strong>The courier tried to deliver and could not</strong>
                {parcel.ndrAt ? ` on ${when(parcel.ndrAt)}` : ''}: {parcel.ndrReason}. They will try again
                {parcel.ndrAttempts > 1 ? ' - please keep your phone reachable' : ''}.
              </p>
            )}

            {/* Said in words, with what to DO. In India the pickup rider brings
                the label (Amazon, Flipkart, every reverse courier) - so the
                answer to "what do I attach?" is "nothing; keep it packed with
                the tag on". The page used to say only "Return: picked". */}
            {parcel.returnStage && (
              <div className="mt-3 rounded-lg border p-3 text-sm">
                <p>
                  <strong>
                    {parcel.returnResolution === 'replacement' ? 'Exchange' : 'Return'}
                    {' · '}
                    {{
                      requested: 'waiting for the seller to book the pickup',
                      picked: 'pickup booked',
                      received: 'received by the seller',
                      rejected: 'refused by the seller',
                    }[parcel.returnStage] || parcel.returnStage}
                  </strong>
                </p>
                {['requested', 'picked'].includes(parcel.returnStage) && (
                  <p className="mt-1 text-muted-foreground">
                    Keep it in its original packing with the tag on. The pickup rider brings the label - you do not print anything.
                    {parcel.returnAwb ? ` Pickup reference ${parcel.returnAwb}.` : ''}
                  </p>
                )}
                {parcel.returnStage === 'received' && (
                  <p className="mt-1 text-muted-foreground">
                    {parcel.returnResolution === 'replacement'
                      ? 'The replacement is on its way, delivered free.'
                      : `Your refund goes back the way you paid, within ${REFUND_DAYS}.`}
                  </p>
                )}
                {parcel.returnStage === 'rejected' && !parcel.disputeStatus && (
                  <p className="mt-1 text-muted-foreground">
                    If you disagree, use <em>Something&apos;s wrong</em> below - an admin decides, not the seller.
                  </p>
                )}
              </div>
            )}

            {parcel.disputeStatus === 'open' && (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <strong>We are looking into this.</strong> The seller has been asked to respond
                {parcel.disputeRaisedAt ? ` (raised ${when(parcel.disputeRaisedAt)})` : ''}, and nothing is paid
                out to them until it is settled.
              </p>
            )}
            {parcel.disputeStatus === 'resolved_customer' && (
              <p className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
                Settled in your favour.
              </p>
            )}
            {parcel.disputeStatus === 'resolved_seller' && (
              <p className="mt-3 rounded-lg bg-muted p-3 text-sm">
                Settled in the seller&apos;s favour. If something is still wrong,{' '}
                <Link href="/contact" className="text-brand-ink hover:underline">tell us</Link>.
              </p>
            )}

            {(awaitingMe || arguable) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {/* Only where the seller says they delivered it themselves and
                    no courier can be asked. Confirming ends the hold on their
                    payout, which is why it is the customer's to press. */}
                {awaitingMe && (
                  <Button
                    size="sm"
                    disabled={working}
                    onClick={() => act(`/customer/orders/${orderId}/confirm-receipt`, undefined, 'POST', 'Thank you')}
                  >
                    Yes, I received it
                  </Button>
                )}
                {arguable && (
                  <Button variant="outline" size="sm" disabled={working} onClick={() => setAsking({ kind: 'dispute', parcel })}>
                    Something&apos;s wrong
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}

      {(canReturn || returning) && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Not right?</h2>
          {!returning && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                You can return or exchange until {returnWindowClosesAt ? when(returnWindowClosesAt) : 'the window closes'}.
              </p>
              <Button className="mt-3" variant="outline" size="sm" onClick={() => setReturning(true)}>
                Return or exchange
              </Button>
            </>
          )}

          {returning && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(`/customer/orders/${orderId}/return`, returnForm, 'POST', 'Request sent');
              }}
              className="mt-4 space-y-4"
            >
              {/*
                Money back, or the same item again. Asked here, once, because
                the seller's payout and the courier booking both depend on it.
              */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">What would you like?</legend>
                {[
                  ['refund', 'My money back', 'Refunded to the way you paid, once it reaches the seller'],
                  ['replacement', 'The same item again', 'Nothing is refunded; the replacement is delivered free'],
                ].map(([value, label, note]) => (
                  <label key={value} className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary">
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
                <label htmlFor="reason" className="text-sm font-medium">What went wrong?</label>
                <Textarea
                  id="reason"
                  required
                  minLength={3}
                  rows={3}
                  value={returnForm.reason}
                  onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
                  className="mt-1.5 w-full"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">The seller reads this. A line is enough.</p>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={working}>{working ? 'Sending…' : 'Send the request'}</Button>
                <Button type="button" onClick={() => setReturning(false)} variant="ghost" size="sm">Not now</Button>
              </div>
            </form>
          )}
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href={`/orders/${orderId}/bill`} className="text-brand-ink hover:underline">Bill of Supply</Link>
        {' '}- print it or save it as a PDF. Something else wrong?{' '}
        <Link href="/contact" className="text-brand-ink hover:underline">Tell us</Link>.
      </p>

      {/*
        Three confirmations, one dialog. Cancelling cannot be undone from here
        (the refund is raised the moment it is accepted), so it is asked; a
        dispute is asked because an admin and a seller will both read it.
      */}
      <ActionDialog
        open={Boolean(asking)}
        onOpenChange={(next) => setAsking(next ? asking : null)}
        title={
          asking?.kind === 'cancelOrder'
            ? 'Cancel the whole order'
            : asking?.kind === 'cancelItem'
              ? `Cancel ${asking.item.name}`
              : "Tell us what's wrong"
        }
        description={
          asking?.kind === 'dispute'
            ? 'An admin reads this and the seller is asked to respond. Nothing is paid out to them until it is settled.'
            : order.paymentMethod === 'cod'
              ? 'Nothing was charged, so nothing is refunded. The seller is told.'
              : `The refund goes back the way you paid, within ${REFUND_DAYS}. The seller is told.`
        }
        reasons={
          asking?.kind === 'dispute'
            ? DISPUTE_REASONS
            : ['I changed my mind', 'I ordered by mistake', 'Found it cheaper elsewhere', 'It is taking too long']
        }
        requireReason={asking?.kind !== 'cancelItem'}
        detailsLabel={asking?.kind === 'dispute' ? 'What happened? (optional, but it helps)' : undefined}
        destructive={asking?.kind !== 'dispute'}
        confirmLabel={
          asking?.kind === 'cancelOrder' ? 'Cancel the order' : asking?.kind === 'cancelItem' ? 'Cancel this item' : 'Send it'
        }
        busy={working}
        note={asking?.kind === 'dispute' ? 'Say what happened as you would to a person. Dates and photos help.' : undefined}
        onConfirm={(reason) => {
          const { kind, item } = asking;
          setAsking(null);
          if (kind === 'cancelOrder') act(`/customer/orders/${orderId}/cancel`, { reason }, 'PATCH', 'Order cancelled');
          else if (kind === 'cancelItem') act(`/customer/orders/${orderId}/items/${item._id}/cancel`, undefined, 'PATCH', 'Item cancelled');
          else act(`/customer/orders/${orderId}/dispute`, { reason }, 'POST', 'We have it');
        }}
      />
    </div>
  );
}

function OrderSkeleton() {
  return (
    <div className="skeleton-in space-y-6" aria-busy="true" aria-label="Loading your order">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="mt-4 h-4 w-72" />
      </div>
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-4 h-16 w-full rounded-lg" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    </div>
  );
}
