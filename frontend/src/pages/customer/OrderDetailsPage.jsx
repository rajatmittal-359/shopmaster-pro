import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';

import Layout from '../../components/common/Layout';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ShipmentTimeline, { readable } from '../../components/customer/ShipmentTimeline';
import {
  getOrderDetails,
  cancelOrder,
  returnOrder,
  cancelOrderItem,
} from '../../services/orderService';
import { toastSuccess, toastError } from '../../utils/toast';
import { orderRef } from '../../utils/orderRef';
import { useConfirm } from '../../context/confirmContext';
import { money } from '../../utils/money';

/**
 * One order, for the person waiting on it.
 *
 * WHAT THIS PAGE IS FOR
 *   Somebody who has already paid opens it to ask one of three things: when is
 *   it coming, where is it now, and something is wrong so what can I do. Items,
 *   address and payment are reference - they are not why anyone came.
 *
 *   The old page opened with the order number, then "Status: Shipped", then
 *   "Payment: PAID". That is the system's view of the order. "Shipped" answers
 *   none of the three questions, and the reference number is for support, not
 *   for the customer.
 *
 *   So the arrival date is the headline, the journey is the body, and the
 *   reference details sit quietly underneath.
 *
 * WHAT IT REFUSES TO DO
 *   It never states a date it does not have. Until the courier sends one there
 *   is no "arriving by" line at all - a guessed date is worse than none, because
 *   the whole point of the page is to be believed.
 */

/** The headline: the answer they came for, in the plainest words available. */
const arrival = (order, fulfilment) => {
  const day = (d) =>
    new Date(d).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  /*
   * WHO cancelled it, not just that somebody did.
   *
   * "This order was cancelled" leaves the most important question unanswered.
   * A customer who did not cancel it needs to know that at a glance - it means
   * they are owed money and should expect a refund, rather than an item.
   */
  if (order.status === 'cancelled') {
    if (order.cancelledBy === 'seller') return 'The seller cancelled this order';
    if (order.cancelledBy === 'admin') return 'We cancelled this order';
    if (order.cancelledBy === 'customer') return 'You cancelled this order';
    return 'This order was cancelled';
  }
  if (order.status === 'returned') return 'This order was returned';
  if (fulfilment?.deliveredAt) return `Delivered on ${day(fulfilment.deliveredAt)}`;
  if (fulfilment?.expectedDeliveryAt) return `Arriving by ${day(fulfilment.expectedDeliveryAt)}`;

  /*
   * No date from the courier yet, so say where it has actually got to.
   *
   * "On its way" is wrong before collection: our `shipped` means the seller
   * booked a courier, and the parcel can sit on their shelf for a day after
   * that. A customer told it is on its way, who then waits, stops believing
   * the page - which is the only thing this page has.
   */
  if (order.status === 'shipped') {
    return fulfilment?.scans?.length ? 'On its way' : 'Booked with a courier';
  }
  return 'Being prepared by the seller';
};

/** One quiet line under the headline: where it actually is. */
const whereabouts = (order, fulfilment) => {
  if (fulfilment?.ndrReason) return `Delivery attempted — ${fulfilment.ndrReason}`;
  if (order.status === 'cancelled') {
    const why = order.cancellationReason;
    // A refund is the thing they want confirmed, so it is said either way.
    const refund =
      order.paymentStatus === 'refunded'
        ? 'Your money has been refunded.'
        : order.paymentMethod === 'cod'
          ? null
          : 'Your refund is on its way.';
    return [why, refund].filter(Boolean).join(' ') || null;
  }
  const latest = fulfilment?.scans?.[0];
  if (latest?.activity) {
    const place = latest.location ? ` · ${readable(latest.location)}` : '';
    return `${readable(latest.activity)}${place}`;
  }
  // Couriers shout: "IN TRANSIT" under a headline is noise, not information.
  if (fulfilment?.courierStatus) return readable(fulfilment.courierStatus);
  if (order.status === 'pending') return 'It will be handed to a courier shortly.';
  return null;
};

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [order, setOrder] = useState(null);
  const [rules, setRules] = useState({ canReturn: false, canCancel: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await getOrderDetails(orderId);
      setOrder(data.order);
      setRules({
        canReturn: Boolean(data.canReturn),
        canCancel: Boolean(data.canCancel),
        returnWindowClosesAt: data.returnWindowClosesAt,
      });
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not load that order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action, ask, done) => {
    const sure = await confirm(ask);
    if (!sure) return;
    setBusy(true);
    try {
      await action();
      toastSuccess(done);
      await load();
    } catch (err) {
      toastError(err?.response?.data?.message || 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Order">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="h-28 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-56 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout title="Order">
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-gray-700">We could not find that order.</p>
          <Button as="button" variant="secondary" className="mt-4" onClick={() => navigate('/customer/orders')}>
            Back to my orders
          </Button>
        </div>
      </Layout>
    );
  }

  // One seller for now; the shape already allows more, and this picks the
  // parcel rather than assuming the order only ever has one.
  const fulfilment = order.fulfilments?.[0];
  const address = order.shippingAddressId;
  const tracking = fulfilment?.awb || order.shippingAwb;
  const courier = fulfilment?.courierName || order.shippingCourierName;
  const live = !['cancelled', 'returned', 'delivered'].includes(order.status);

  // The goods alone. totalAmount already has delivery in it, so taking it back
  // out is the only way to show the two separately without a second source.
  const itemsTotal = Math.max(0, (order.totalAmount || 0) - (order.shippingCharges || 0));

  const copyTracking = async () => {
    try {
      await navigator.clipboard.writeText(tracking);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toastError('Could not copy — please select and copy it by hand');
    }
  };

  return (
    <Layout title="Order">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* THE ANSWER. Everything else on this page is support for it. */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xl font-semibold text-gray-900">
            {arrival(order, fulfilment)}
          </h2>
          {whereabouts(order, fulfilment) && (
            <p className="text-sm text-gray-600 mt-1">{whereabouts(order, fulfilment)}</p>
          )}

          {(live || fulfilment?.scans?.length) && (
            <div className="mt-5">
              <ShipmentTimeline order={order} fulfilment={fulfilment} />
            </div>
          )}
        </section>

        {/* The courier, for anyone who wants to check with them directly. */}
        {tracking && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-700">
              {courier || 'Courier'}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 min-w-0 truncate text-sm bg-gray-50 border border-gray-200
                               rounded-lg px-3 py-2 tabular-nums">
                {tracking}
              </code>
              <Button variant="secondary" size="sm" onClick={copyTracking} aria-label="Copy tracking number">
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </Button>
            </div>
            {order.shippingTrackingUrl && (
              <a
                href={order.shippingTrackingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-3 text-sm text-brand-ink font-medium"
              >
                Track on the courier&rsquo;s site
              </a>
            )}
          </section>
        )}

        {/* What they can do about it - and only what they actually can. */}
        {(rules.canCancel || rules.canReturn) && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap gap-2">
              {rules.canCancel && (
                <Button
                  variant="destructive"
                  loading={busy}
                  onClick={() =>
                    run(
                      () => cancelOrder(orderId),
                      {
                        title: 'Cancel this order?',
                        message:
                          order.paymentStatus === 'paid'
                            ? 'You will be refunded in full, back to the way you paid.'
                            : 'Nothing has been charged, so there is nothing to refund.',
                        confirmLabel: 'Cancel the order',
                        cancelLabel: 'Keep it',
                      },
                      'Order cancelled'
                    )
                  }
                >
                  Cancel this order
                </Button>
              )}

              {rules.canReturn && (
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() =>
                    run(
                      () => returnOrder(orderId),
                      {
                        title: 'Return this order?',
                        message: 'We will arrange collection and refund you once it reaches the seller.',
                        confirmLabel: 'Start the return',
                        cancelLabel: 'Keep it',
                      },
                      'Return started'
                    )
                  }
                >
                  Return this order
                </Button>
              )}
            </div>

            {rules.canReturn && rules.returnWindowClosesAt && (
              <p className="text-xs text-gray-500 mt-3">
                You can return this until{' '}
                {new Date(rules.returnWindowClosesAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                })}
                .
              </p>
            )}
          </section>
        )}

        {/* Reference. Quiet on purpose: true, and not why anyone came. */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-2">
              {order.items.length} item{order.items.length > 1 ? 's' : ''}
            </p>
            <ul className="divide-y divide-gray-100">
              {order.items.map((item) => {
                // Populated when the product still exists; an order line keeps
                // its own name and price either way.
                const product = item.productId;
                const image = product?.images?.[0];
                const href = product?.slug || product?._id;
                const gone = item.status === 'cancelled';

                return (
                  <li
                    key={item._id}
                    className={`flex items-start gap-3 py-3 first:pt-0 last:pb-0 ${
                      gone ? 'opacity-60' : ''
                    }`}
                  >
                    <div
                      className="w-14 h-14 shrink-0 rounded-lg bg-gray-100 overflow-hidden
                                 border border-gray-200"
                    >
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      {href ? (
                        <Link
                          to={`/products/${href}`}
                          className="text-sm text-gray-900 hover:text-brand-ink line-clamp-2"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <p className="text-sm text-gray-900 line-clamp-2">{item.name}</p>
                      )}

                      <p className="text-xs text-gray-500 mt-0.5">
                        Qty {item.quantity} · {money(item.price)} each
                      </p>

                      {gone && (
                        <p className="text-xs text-gray-500 mt-1">
                          Cancelled · refunded to your original payment method
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm tabular-nums ${
                          gone ? 'text-gray-500 line-through' : 'text-gray-900 font-medium'
                        }`}
                      >
                        {money(item.price * item.quantity)}
                      </p>

                      {/* One item of several, and only while the whole order
                          could still be cancelled anyway. */}
                      {rules.canCancel && order.items.length > 1 && !gone && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => cancelOrderItem(orderId, item._id),
                              {
                                title: `Remove ${item.name}?`,
                                message:
                                  'The rest of the order carries on, and you are refunded for this item.',
                                confirmLabel: 'Remove it',
                                cancelLabel: 'Keep it',
                              },
                              'Item cancelled'
                            )
                          }
                          className="text-xs text-red-600 hover:underline disabled:opacity-50 mt-1"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/*
              PRICE DETAILS - what a marketplace calls this block, and what a
              customer checks when the amount on their statement does not look
              like the price on the product.

              Only lines we can prove: the order stores totalAmount and
              shippingCharges, and item price is snapshotted per line. There is
              no MRP on an order item, so there is no "you saved" here - it
              would have to be guessed from today's price, and a saving that
              cannot be proved is not worth printing.
            */}
            <dl className="border-t border-gray-100 mt-3 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Item total</dt>
                <dd className="tabular-nums text-gray-800">{money(itemsTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Delivery</dt>
                <dd className="tabular-nums text-gray-800">
                  {order.shippingCharges > 0 ? money(order.shippingCharges) : 'Free'}
                </dd>
              </div>
              {order.refundAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Refunded</dt>
                  <dd className="tabular-nums text-positive">
                    −{money(order.refundAmount)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-100 pt-2 mt-2">
                <dt>Total paid</dt>
                <dd className="tabular-nums">{money(order.totalAmount)}</dd>
              </div>
            </dl>

            {/*
              The document a customer is entitled to, and the one they need for
              a return, an expense claim or a warranty. Marketplaces call this
              "Download invoice"; ours is a Bill of Supply, because the shop is
              not registered under GST and may not issue a tax invoice.
            */}
            <Link
              to={`/customer/orders/${orderId}/bill`}
              className="inline-block mt-3 text-sm font-medium text-brand-ink hover:underline"
            >
              Download bill
            </Link>
          </div>

          {address && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500 mb-1">Delivering to</p>
              <address className="not-italic text-sm text-gray-700">
                {address.street}
                <br />
                {address.city}, {address.state} {address.zipCode}
                <br />
                {address.phoneNumber}
              </address>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
            <span>{orderRef(order)}</span>
            <span>
              {new Date(order.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <span>
              {order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}
            </span>
            <Badge status={order.paymentStatus}>{order.paymentStatus}</Badge>
          </div>
        </section>
      </div>
    </Layout>
  );
}
