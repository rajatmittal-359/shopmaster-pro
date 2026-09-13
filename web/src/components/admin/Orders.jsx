'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ActionDialog from '@/components/common/ActionDialog';
import DisputeBrief from '@/components/admin/DisputeBrief';

/**
 * Everything that has been ordered, and the one screen that can settle an
 * argument.
 *
 * IT OPENS ON "NEEDS ME"
 *   The API has a filter for exactly this: open disputes, returns waiting to be
 *   picked or received, replacements owed and not sent, and couriers a seller
 *   could not book. Every one of those holds somebody's money still. A list
 *   sorted by date buries them among orders that need nothing, which is how a
 *   dispute sits for a week.
 *
 * DECIDING IS TWO ANSWERS, NOT ONE BUTTON
 *   Who it goes to, and why - and the why is shown to BOTH sides. The API
 *   refuses a decision shorter than three characters, which is the right rule:
 *   a ruling nobody explained is one the loser has no way to understand.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const when = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const BLANK_DECISION = { inFavourOf: 'customer', resolution: '', goodsReturned: false };

export default function AdminOrders() {
  const [needsMe, setNeedsMe] = useState(true);
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [deciding, setDeciding] = useState(null);
  const [decision, setDecision] = useState(BLANK_DECISION);
  const [cancelling, setCancelling] = useState(null);

  const load = async (onlyMine = needsMe) => {
    const data = await authedFetch(`/admin/orders?limit=50${onlyMine ? '&needsMe=true' : ''}`);
    setOrders(data.orders || []);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch(`/admin/orders?limit=50${needsMe ? '&needsMe=true' : ''}`);
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
  }, [needsMe]);

  const run = async (fn) => {
    setState({ status: 'working' });
    try {
      await fn();
      setDeciding(null);
      setDecision(BLANK_DECISION);
      await load();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="skeleton-in space-y-4" aria-busy="true" aria-label="Loading orders">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant={needsMe ? 'default' : 'outline'} size="sm" onClick={() => setNeedsMe(true)}>
          Needs me
        </Button>
        <Button variant={needsMe ? 'outline' : 'default'} size="sm" onClick={() => setNeedsMe(false)}>
          Everything
        </Button>
        <p aria-live="polite" className="text-sm">
          {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
        </p>
      </div>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">
          {needsMe
            ? 'Nothing is waiting on you - no open disputes, returns or failed bookings.'
            : 'No orders yet.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => {
            const disputes = (order.fulfilments || []).filter((f) => f.disputeStatus === 'open');

            return (
              <li key={order._id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {order.orderNumber || String(order._id).slice(-6).toUpperCase()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {order.customerId?.name} · {when(order.createdAt)} · {money(order.totalAmount)}{' '}
                      · {order.paymentMethod === 'cod' ? 'COD' : 'online'}
                    </p>
                  </div>
                  <p className="text-sm capitalize">{String(order.status).replace(/_/g, ' ')}</p>
                </div>

                {(order.fulfilments || []).map((parcel, i) => (
                  <div key={parcel._id || i} className="mt-2 text-sm">
                    <p className="text-muted-foreground">
                      Parcel {i + 1}: {parcel.status}
                      {parcel.returnStage ? ` · return ${parcel.returnStage}` : ''}
                      {parcel.replacementStage ? ` · replacement ${parcel.replacementStage}` : ''}
                      {parcel.disputeStatus === 'open' ? ' · DISPUTE OPEN' : ''}
                      {parcel.bookingFailedReason
                        ? ` · booking failed: ${parcel.bookingFailedReason}`
                        : ''}
                    </p>

                    {/* The referee's evidence, on the same screen as the verdict.
                        Every one of these was stored and shown to nobody, so a
                        dispute was two people's word. Amazon's A-to-z shows the
                        claim, the carrier's proof and the attempts together. */}
                    {(parcel.disputeStatus || parcel.podUrl || parcel.ndrReason || parcel.nprReason) && (
                      <dl className="mt-1 grid gap-x-4 gap-y-1 rounded-lg border bg-muted/40 p-3 sm:grid-cols-[auto_1fr]">
                        {parcel.disputeReason && (
                          <>
                            <dt className="text-muted-foreground">Customer says</dt>
                            <dd>{parcel.disputeReason}{parcel.disputeRaisedAt ? ` (${when(parcel.disputeRaisedAt)})` : ''}</dd>
                          </>
                        )}
                        <dt className="text-muted-foreground">Delivered</dt>
                        <dd>
                          {parcel.deliveredAt ? when(parcel.deliveredAt) : 'not yet'}
                          {parcel.deliveryConfirmedBy ? ` · confirmed by ${parcel.deliveryConfirmedBy}` : ''}
                          {parcel.courierName ? ` · ${parcel.courierName}${parcel.awb ? ` ${parcel.awb}` : ''}` : ''}
                        </dd>
                        {parcel.disputeRaisedBy === 'seller' && (
                          <>
                            <dt className="text-muted-foreground">Raised by</dt>
                            <dd>the seller - the return came back not as sent</dd>
                          </>
                        )}
                        {parcel.returnKind && (
                          <>
                            <dt className="text-muted-foreground">Return</dt>
                            <dd>
                              {parcel.returnKind.replace(/_/g, ' ')}{parcel.returnTagIntact === true ? ' · tag confirmed' : ''}
                              {parcel.returnEvidence?.length ? <> · {parcel.returnEvidence.map((u, k) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-brand-ink hover:underline">photo {k + 1}</a>).reduce((acc, x) => (acc === null ? [x] : [...acc, ' ', x]), null)}</> : ' · no customer photos'}
                              {parcel.returnNeedsApproval && !parcel.returnApprovedAt ? ' · WAITING FOR YOUR APPROVAL' : ''}
                            </dd>
                          </>
                        )}
                        <dt className="text-muted-foreground">Pack proof</dt>
                        <dd>{parcel.packProof?.url ? <a href={parcel.packProof.url} target="_blank" rel="noopener noreferrer" className="text-brand-ink hover:underline">Seller&apos;s photo before dispatch ({when(parcel.packProof.at)})</a> : <span className="text-muted-foreground">none from the seller</span>}</dd>
                        {parcel.receiptCheck?.at && (
                          <>
                            <dt className="text-muted-foreground">Came back</dt>
                            <dd>
                              {parcel.receiptCheck.ok ? 'OK' : 'NOT as sent'}{parcel.receiptCheck.note ? ` - ${parcel.receiptCheck.note}` : ''}
                              {parcel.receiptCheck.photos?.length ? <> · {parcel.receiptCheck.photos.map((u, k) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-brand-ink hover:underline">photo {k + 1}</a>).reduce((acc, x) => (acc === null ? [x] : [...acc, ' ', x]), null)}</> : ''}
                            </dd>
                          </>
                        )}
                        {parcel.disputeSellerRespondedAt && (
                          <>
                            <dt className="text-muted-foreground">Seller says</dt>
                            <dd>
                              {parcel.disputeSellerNote} ({when(parcel.disputeSellerRespondedAt)})
                              {parcel.disputeSellerEvidence?.length ? <> · {parcel.disputeSellerEvidence.map((u, k) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-brand-ink hover:underline">photo {k + 1}</a>).reduce((acc, x) => (acc === null ? [x] : [...acc, ' ', x]), null)}</> : ''}
                            </dd>
                          </>
                        )}
                        {parcel.disputeStatus === 'open' && parcel.disputeRaisedBy !== 'seller' && !parcel.disputeSellerRespondedAt && (
                          <>
                            <dt className="text-muted-foreground">Seller says</dt>
                            <dd className="text-muted-foreground">nothing yet (72 h from {parcel.disputeRaisedAt ? when(parcel.disputeRaisedAt) : 'the claim'})</dd>
                          </>
                        )}
                        <dt className="text-muted-foreground">Proof of delivery</dt>
                        <dd>
                          {parcel.podUrl ? (
                            <a href={parcel.podUrl} target="_blank" rel="noopener noreferrer" className="text-brand-ink hover:underline">
                              Open the courier&apos;s POD
                            </a>
                          ) : (
                            <span className="text-muted-foreground">none from the courier</span>
                          )}
                        </dd>
                        {parcel.ndrReason && (
                          <>
                            <dt className="text-muted-foreground">Failed attempts</dt>
                            <dd>{parcel.ndrAttempts || 1} · {parcel.ndrReason}{parcel.ndrAt ? ` (${when(parcel.ndrAt)})` : ''}</dd>
                          </>
                        )}
                        {parcel.nprReason && (
                          <>
                            <dt className="text-muted-foreground">Not collected</dt>
                            <dd>{parcel.nprReason}</dd>
                          </>
                        )}
                      </dl>
                    )}
                  </div>
                ))}

                {/* A return held for the admin (a customer under returns_approval, or a big amount). */}
                {(order.fulfilments || []).filter((f) => f.returnNeedsApproval && !f.returnApprovedAt && f.returnStage === 'requested').map((f) => (
                  <div key={`appr-${f._id}`} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                    <span className="font-medium text-amber-800">Return waiting for your approval</span>
                    <Button size="sm" onClick={() => run(() => authedFetch(`/admin/orders/${order._id}/return/approve`, { method: 'POST', body: { sellerId: f.sellerId, approve: true } }))}>Approve - book the pickup</Button>
                    <Button size="sm" variant="outline" onClick={() => { const note = window.prompt('Why is this return refused? The customer reads this.'); if (note && note.trim().length > 4) run(() => authedFetch(`/admin/orders/${order._id}/return/approve`, { method: 'POST', body: { sellerId: f.sellerId, approve: false, note } })); }}>Refuse</Button>
                  </div>
                ))}

                {disputes.length > 0 && (
                  <DisputeBrief
                    orderId={order._id}
                    sellerId={disputes[0]?.sellerId}
                    onSuggest={(inFavourOf) => setDecision((d) => (deciding === order._id ? d : { ...d, inFavourOf }))}
                    onUseNote={(note) => { setDeciding(order._id); setDecision((d) => ({ ...d, resolution: note })); }}
                  />
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {disputes.length > 0 && deciding !== order._id && (
                    <Button size="sm" onClick={() => setDeciding(order._id)}>
                      Decide the dispute
                    </Button>
                  )}

                  {['pending', 'processing'].includes(order.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCancelling(order._id)}
                    >
                      Cancel the order
                    </Button>
                  )}
                </div>

                {deciding === order._id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() =>
                        authedFetch(`/admin/orders/${order._id}/dispute/resolve`, {
                          method: 'POST',
                          body: {
                            sellerId: disputes[0]?.sellerId,
                            inFavourOf: decision.inFavourOf,
                            resolution: decision.resolution,
                            goodsReturned: decision.goodsReturned,
                          },
                        })
                      );
                    }}
                    className="mt-4 space-y-3 rounded-lg border border-border p-3"
                  >
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Who is right?</legend>
                      {[
                        ['customer', 'The customer - refund them'],
                        ['seller', 'The seller - no refund'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`favour-${order._id}`}
                            checked={decision.inFavourOf === value}
                            onChange={() => setDecision({ ...decision, inFavourOf: value })}
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={decision.goodsReturned}
                        onChange={(e) =>
                          setDecision({ ...decision, goodsReturned: e.target.checked })
                        }
                      />
                      The goods are back with the seller
                    </label>

                    <div>
                      <label htmlFor={`why-${order._id}`} className="text-sm font-medium">
                        Why you decided this
                      </label>
                      <Textarea
                        id={`why-${order._id}`}
                        required
                        minLength={3}
                        rows={3}
                        value={decision.resolution}
                        onChange={(e) => setDecision({ ...decision, resolution: e.target.value })}
                        className="mt-1"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Both the customer and the seller see this. A ruling nobody
                        explained is one the loser cannot understand.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button type="submit" size="sm" disabled={state.status === 'working'}>
                        Record the decision
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeciding(null)}
                      >
                        Not now
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        The reasons come from what actually goes wrong on this platform, and
        the button says what it does. A named reason survives being read six
        months later; "ok" typed into a browser prompt does not.
      */}
      <ActionDialog
        open={Boolean(cancelling)}
        onOpenChange={(next) => setCancelling(next ? cancelling : null)}
        title="Cancel this order"
        description="The customer is refunded and every seller on it is told. This cannot be undone."
        reasons={[
          'The seller cannot fulfil it',
          'The customer asked us to',
          'Suspected fraud',
          'Placed twice by mistake',
        ]}
        requireReason
        destructive
        confirmLabel="Cancel this order"
        busy={state.status === 'working'}
        note="The customer and the seller both see this reason."
        onConfirm={(reason) => {
          const id = cancelling;
          setCancelling(null);
          run(() =>
            authedFetch(`/admin/orders/${id}/cancel`, { method: 'POST', body: { reason } })
          );
        }}
      />
    </div>
  );
}
