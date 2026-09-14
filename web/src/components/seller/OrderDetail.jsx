'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { money } from '@/lib/money';
import { orderRef } from '@/lib/orderRef';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ActionDialog from '@/components/common/ActionDialog';
import PhotoPicker from '@/components/common/PhotoPicker';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n';

const KIND_LABEL = { damaged: 'arrived damaged', wrong: 'wrong / missing item', defective: 'faulty', not_as_described: 'not as described', change_of_mind: 'changed their mind', size: 'size' };

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
  const t = useT();
  /* Fair Returns (plan §4.39): the seller's evidence, one tap each. */
  const [proof, setProof] = useState([]);
  const [receipt, setReceipt] = useState({ open: false, ok: null, photos: [], note: '' });
  const [reply, setReply] = useState({ open: false, note: '', photos: [] });

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

  if (state.status === 'loading') {
    return (
      <div className="skeleton-in space-y-4" aria-busy="true" aria-label="Loading the order">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }
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
            <p className="mt-1 text-muted-foreground">
              {order.returnKind ? <strong className="text-foreground">{KIND_LABEL[order.returnKind] || order.returnKind} · </strong> : null}
              The customer wrote: {order.returnReason}
              {order.returnTagIntact === true ? ' · tag/seal confirmed on' : ''}
            </p>
          )}
          {order.returnEvidence?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {order.returnEvidence.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block size-16 overflow-hidden rounded-md border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="Customer's photo" className="size-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {order.returnNeedsApproval && (
            <p className="mt-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">{t('The admin checks this return first - you will be told when to book the pickup.')}</p>
          )}
          {order.receiptCheck && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('Your receipt check')}: <strong>{order.receiptCheck.ok ? 'OK' : t('not OK')}</strong>{order.receiptCheck.note ? ` - ${order.receiptCheck.note}` : ''} · {when(order.receiptCheck.at)}
            </p>
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
              {/* The seller's side, inside the 72 hours. Photos and the courier's proof - the admin decides on these. */}
              {order.disputeStatus === 'open' && order.disputeRaisedBy !== 'seller' && !order.disputeSellerRespondedAt && (
                <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  {!reply.open ? (
                    <>
                      <p className="text-sm font-medium">{t('Your side, within 72 hours')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t('What you sent, when, and what the courier shows. Your pack proof and the courier’s delivery proof are already on the order.')}</p>
                      <Button size="sm" className="mt-2" onClick={() => setReply({ ...reply, open: true })}>{t('Add my side')}</Button>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Textarea rows={3} value={reply.note} onChange={(e) => setReply({ ...reply, note: e.target.value })} placeholder={t('e.g. Packed on the 6th with the tag on, courier collected the same day; delivery photo shows the parcel at the door.')} />
                      <PhotoPicker value={reply.photos} onChange={(photos) => setReply({ ...reply, photos })} max={3} label={t('Photo')} />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={state.status === 'working' || reply.note.trim().length < 5} onClick={async () => { await act('/dispute/respond', { note: reply.note, photos: reply.photos }); setReply({ open: false, note: '', photos: [] }); }}>{t('Send to the admin')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setReply({ open: false, note: '', photos: [] })}>{t('Not now')}</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {order.disputeSellerRespondedAt && (
                <p className="mt-2 text-xs text-muted-foreground">{t('Your side is on the order')} · {when(order.disputeSellerRespondedAt)}</p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {order.returnStage === 'requested' && !order.returnNeedsApproval && (
              <Button size="sm" onClick={() => act('/return', { action: 'pickup' })}>
                Book the pickup
              </Button>
            )}
            {['requested', 'picked'].includes(order.returnStage) && !order.receiptCheck && !receipt.open && (
              <Button variant="outline" size="sm" onClick={() => setReceipt({ ...receipt, open: true })}>
                {t('It came back - check it')}
              </Button>
            )}
          </div>

          {/*
            The receipt check (plan §4.39 C). OK pays the refund / sends the
            replacement. Not OK needs photos - a refusal without them does not
            count - and then the rulebook decides: goodwill under ₹500 with no
            pack proof, otherwise the admin compares the photos.
          */}
          {receipt.open && (
            <div className="mt-3 space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">{t('What came back?')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary">
                  <input type="radio" name="receipt" checked={receipt.ok === true} onChange={() => setReceipt({ ...receipt, ok: true })} className="mt-1" />
                  <span><strong>{t('As sent')}</strong><span className="block text-xs text-muted-foreground">{order.returnResolution === 'replacement' ? t('The replacement goes out next') : t('The refund is issued')}</span></span>
                </label>
                <label className="flex cursor-pointer gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary">
                  <input type="radio" name="receipt" checked={receipt.ok === false} onChange={() => setReceipt({ ...receipt, ok: false })} className="mt-1" />
                  <span><strong>{t('Not as sent')}</strong><span className="block text-xs text-muted-foreground">{t('Worn, broken, different, or tag removed - photos needed')}</span></span>
                </label>
              </div>
              {receipt.ok === false && (
                <>
                  <PhotoPicker value={receipt.photos} onChange={(photos) => setReceipt({ ...receipt, photos })} max={3} label={t('Photo')} />
                  <Textarea rows={2} value={receipt.note} onChange={(e) => setReceipt({ ...receipt, note: e.target.value })} placeholder={t('One line: what is wrong with it')} />
                  {!order.packProof && <p className="text-xs text-muted-foreground">{t('No pack proof on this parcel: under ₹500 the platform refunds as goodwill once and keeps your photos on the customer’s record. Take pack proof next time and a refusal holds.')}</p>}
                </>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={state.status === 'working' || receipt.ok === null || (receipt.ok === false && (receipt.photos.length === 0 || receipt.note.trim().length < 5))} onClick={async () => { await act('/receipt-check', { ok: receipt.ok, photos: receipt.photos, note: receipt.note }); setReceipt({ open: false, ok: null, photos: [], note: '' }); }}>{t('Record it')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setReceipt({ open: false, ok: null, photos: [], note: '' })}>{t('Not now')}</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/*
        Pack proof (plan §4.39): one photo of the packed item with its tag,
        before the courier. The seller's strongest evidence if this parcel is
        ever "damaged", "wrong" or "empty". Asked, not forced - a shop that
        skips it is told what it is giving up.
      */}
      {['pending', 'processing'].includes(order.status) && !shipped && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h2 className="font-semibold">{t('Pack proof')}</h2>
          {order.packProof ? (
            <p className="mt-1 flex items-center gap-3 text-sm">
              <a href={order.packProof.url} target="_blank" rel="noopener noreferrer" className="block size-14 overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.packProof.url} alt="Pack proof" className="size-full object-cover" />
              </a>
              <span className="text-muted-foreground">{t('Saved')} {when(order.packProof.at)} · {t('your evidence if this parcel is ever disputed')}</span>
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{t('One photo of the packed item with its tag, before the courier comes. If a customer says "damaged" or "empty box", this photo is what decides it.')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <PhotoPicker value={proof} onChange={setProof} max={1} label={t('Take it')} />
                {proof.length > 0 && (
                  <Button size="sm" disabled={state.status === 'working'} onClick={async () => { await act('/pack-proof', { imageDataUrl: proof[0] }); setProof([]); }}>{t('Save pack proof')}</Button>
                )}
              </div>
            </>
          )}
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
          {order.podUrl && (
            <a href={order.podUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted">{t('Courier’s delivery proof')}</a>
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
              ? t('Payout released on {date}', { date: when(order.payout.releasesAt) })
              : t('Paid out {n} days after delivery - the return window has to close first', { n: order.payout.returnWindowDays })}
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
