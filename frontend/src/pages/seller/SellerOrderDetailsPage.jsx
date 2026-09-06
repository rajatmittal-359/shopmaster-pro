import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import { getOrderDetails, updateOrderStatus, updateTracking, settleReturn } from '../../services/sellerService';
import ReasonModal from '../../components/common/ReasonModal';
import Button from '../../components/ui/Button';
import { toastSuccess, toastError } from '../../utils/toast';

import { orderRef } from '../../utils/orderRef';
import { useConfirm } from '../../context/confirmContext';
import { money } from '../../utils/money';
const statusFlow = ['processing', 'shipped', 'delivered'];

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-positive-tint text-positive',
  cancelled: 'bg-red-100 text-red-700',
  returned: 'bg-gray-100 text-gray-700',
};

const paymentColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-positive-tint text-positive',
  completed: 'bg-positive-tint text-positive',
};

/**
 * When this seller's money is released, said plainly.
 *
 * The states come from the server (sellerPayoutStateFor), which reads the same
 * rules a payout run reads. Nothing is worked out here, so the page cannot
 * promise a settlement the payout would refuse.
 */
function PayoutNote({ payout }) {
  if (!payout) return null;

  const on = (d) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

  const text = {
    unpaid_order: 'The customer has not paid for this order yet.',
    awaiting_delivery: `Released ${payout.returnWindowDays} days after the parcel is delivered.`,
    holding: payout.releasesAt
      ? `Held until ${on(payout.releasesAt)}, when the return window shuts.`
      : 'Held until the return window shuts.',
    ready: 'Cleared for the next payout run.',
    paid: 'Paid out.',
    // Something is being argued about. Money that has left cannot be brought
    // back, so an open return or dispute holds it regardless of the date.
    blocked: payout.blockedReason,
  }[payout.state];

  if (!text) return null;

  return (
    <p
      className={`text-xs pt-1 ${
        payout.state === 'paid' ? 'text-positive' : 'text-gray-500'
      }`}
    >
      {text}
    </p>
  );
}

export default function SellerOrderDetailsPage() {
  const confirm = useConfirm();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [refusing, setRefusing] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const res = await getOrderDetails(orderId);
      setOrder(res.data.order);
      // Pre-fill tracking if exists
      if (res.data.order.trackingInfo) {
        setCourierName(res.data.order.trackingInfo.courierName || '');
        setTrackingNumber(res.data.order.trackingInfo.trackingNumber || '');
      }
    } catch (err) {
      toastError(err?.response?.data?.message || 'Failed to load order');
      navigate('/seller/orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (nextStatus) => {
    const sure = await confirm({
      title: `Mark this order as ${nextStatus}?`,
      message: 'The customer is notified, and this cannot be undone.',
      confirmLabel: `Mark ${nextStatus}`,
      danger: false,
    });
    if (!sure) return;

    try {
      setUpdating(true);
      await updateOrderStatus(orderId, nextStatus);
      toastSuccess('Order status updated');
      loadOrder();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleTrackingUpdate = async () => {
    if (!courierName.trim() || !trackingNumber.trim()) {
      toastError('Please enter both courier and tracking number');
      return;
    }

    try {
      await updateTracking(orderId, { courierName, trackingNumber });
      toastSuccess('Tracking information updated');
      loadOrder();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Failed to update tracking');
    }
  };

  const getNextStatus = (current) => {
    if (['cancelled', 'returned'].includes(current)) return null;
    if (current === 'pending') return 'processing';
    if (current === 'processing') return 'shipped';
    if (current === 'shipped') return 'delivered';
    return null;
  };

  const renderTimeline = (status) => {
    if (['cancelled', 'returned'].includes(status)) return null;

    return (
      <div className="flex items-center gap-2 mt-3">
        {statusFlow.map((step, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div
              className={`w-4 h-4 rounded-full flex items-center justify-center text-xs text-white ${
                statusFlow.indexOf(status) >= idx ? 'bg-positive' : 'bg-gray-300'
              }`}
            >
              {statusFlow.indexOf(status) >= idx && '✓'}
            </div>
            <span className="text-xs capitalize">{step}</span>
            {idx !== statusFlow.length - 1 && <div className="w-12 h-0.5 bg-gray-300"></div>}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Layout title="Order Details">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded-lg w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout title="Order Details">
        <p className="text-red-600">Order not found</p>
      </Layout>
    );
  }

  // Same rule as the list: a courier-carried parcel is not the seller's to
  // declare delivered. See getNextStatus there.
  const nextStatus =
    order.status === 'shipped' && !order.canDeclareDelivered
      ? null
      : getNextStatus(order.status);
  return (
    <Layout title="Order Details">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Order Details</h2>
            <p className="text-sm text-gray-600">Order {orderRef(order)}</p>
            <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-lg text-sm font-medium capitalize ${
                statusColors[order.status] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {order.status}
            </span>
            <span
              className={`px-3 py-1 rounded-lg text-sm font-medium capitalize ${
                paymentColors[order.paymentStatus] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {order.paymentStatus}
            </span>
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="font-semibold text-lg mb-3">Customer Information</h3>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Name:</strong> {order.customerId?.name || 'N/A'}
            </p>
            <p>
              <strong>Email:</strong> {order.customerId?.email || 'N/A'}
            </p>
          </div>
        </div>

        {/* Shipping Address */}
        {order.shippingAddressId && (
          <div className="bg-white p-5 rounded-lg shadow">
            <h3 className="font-semibold text-lg mb-3">Shipping Address</h3>
            <div className="text-sm space-y-1">
              <p>{order.shippingAddressId.street}</p>
              <p>
                {order.shippingAddressId.city}, {order.shippingAddressId.state} -{' '}
                {order.shippingAddressId.zipCode}
              </p>
              <p>{order.shippingAddressId.country || 'India'}</p>
              <p className="text-gray-600">Phone: {order.shippingAddressId.phoneNumber}</p>
            </div>
          </div>
        )}

        {/* What was bought, and what it is worth to this seller. */}
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">
            {order.items.length} item{order.items.length > 1 ? 's' : ''} to send
          </h3>

          <ul className="divide-y divide-gray-100">
            {order.items.map((item) => {
              const gone = item.status === 'cancelled';
              return (
                <li
                  key={item._id}
                  className={`flex items-start justify-between gap-3 py-3 first:pt-0
                              last:pb-0 ${gone ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Qty {item.quantity} · {money(item.price)} each
                    </p>
                    {gone && (
                      <p className="text-xs text-gray-500 mt-1">
                        Cancelled · not yours to pack, and not counted below
                      </p>
                    )}
                  </div>

                  <p
                    className={`text-sm tabular-nums shrink-0 ${
                      gone ? 'text-gray-500 line-through' : 'text-gray-900 font-medium'
                    }`}
                  >
                    {money(item.price * item.quantity)}
                  </p>
                </li>
              );
            })}
          </ul>

          {/*
            The seller's money, and only the seller's money.

            This box used to end with a green tick reading "Payment received" -
            which was true of the CUSTOMER's payment and false of this seller's.
            A seller read it as "I have been paid" when the money is held until
            the parcel arrives and the return window shuts. What replaces it is
            the one line that answers the question they actually had: when.
          */}
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Customer paid</span>
              <span className="tabular-nums">{money(order.sellerSubtotal)}</span>
            </div>

            {order.sellerCommission > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>
                  Platform commission
                  {order.items?.[0]?.commissionRate
                    ? ` (${order.items[0].commissionRate}%)`
                    : ''}
                </span>
                <span className="tabular-nums">−{money(order.sellerCommission)}</span>
              </div>
            )}

            <div
              className="flex justify-between pt-2 mt-1 border-t border-gray-100
                         text-base font-semibold text-gray-900"
            >
              <span>You earn</span>
              <span className="text-brand-ink tabular-nums">
                {money(order.sellerEarning)}
              </span>
            </div>

            <PayoutNote payout={order.payout} />
          </div>
        </div>

        {/*
          A return the customer has asked for.

          The seller had no idea one existed: nothing on any screen showed it,
          while the request quietly held their payout. Receiving the goods back
          is what raises the customer's refund - it is deliberately not raised
          when they ask, because a request is a claim and the goods coming back
          is the fact.
        */}
        {['requested', 'picked'].includes(order.returnStage) && (
          <div className="bg-white p-5 rounded-xl border border-gray-200">
            <h3 className="font-semibold text-gray-900">The customer wants to return this</h3>
            <p className="text-sm text-gray-600 mt-1">
              They said: “{order.returnReason}”
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Your payment for this order is held until it is settled.
            </p>

            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                loading={updating}
                onClick={async () => {
                  setUpdating(true);
                  try {
                    const { data } = await settleReturn(order._id, 'receive');
                    toastSuccess(data.message || 'Return received');
                    await loadOrder();
                  } catch (err) {
                    toastError(err?.response?.data?.message || 'That did not work');
                  } finally {
                    setUpdating(false);
                  }
                }}
              >
                I have the item back
              </Button>
              <Button variant="secondary" disabled={updating} onClick={() => setRefusing(true)}>
                Refuse this return
              </Button>
            </div>
          </div>
        )}

        {/* A customer says the record is wrong, and an admin will decide. */}
        {order.disputeStatus === 'open' && (
          <div className="bg-white p-5 rounded-xl border border-gray-200">
            <h3 className="font-semibold text-gray-900">This order is disputed</h3>
            <p className="text-sm text-gray-600 mt-1">
              The customer said: “{order.disputeReason}”
            </p>
            <p className="text-xs text-gray-500 mt-2">
              An admin is looking at it. Send them anything that shows what happened —
              the courier POD, the pickup scan, a delivery photo. Nothing is paid out
              until it is decided.
            </p>
          </div>
        )}

        {/* Tracking */}
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="font-semibold text-lg mb-3">Tracking Information</h3>
          {order.trackingInfo?.courierName ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Courier:</strong> {order.trackingInfo.courierName}
              </p>
              <p>
                <strong>Tracking Number:</strong> {order.trackingInfo.trackingNumber}
              </p>
              {order.trackingInfo.shippedDate && (
                <p className="text-gray-600">
                  Shipped: {new Date(order.trackingInfo.shippedDate).toLocaleDateString()}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-3">
                Add tracking info to notify the customer about shipment.
              </p>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Courier Name (e.g., Blue Dart)"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Tracking Number"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg"
                />
                <button
                  onClick={handleTrackingUpdate}
                  className="px-6 py-2 bg-positive hover:bg-positive-strong text-white rounded-lg"
                >
                  Save Tracking
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Status Timeline */}
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="font-semibold text-lg mb-2">Order Status</h3>
          {renderTimeline(order.status)}

          {nextStatus && (
            <button
              onClick={() => handleStatusUpdate(nextStatus)}
              disabled={updating}
              className="mt-4 w-full py-3 bg-brand-fill hover:bg-brand-fill-hover text-on-brand rounded-lg font-semibold disabled:opacity-50"
            >
              {updating ? 'Updating...' : `Mark as ${nextStatus}`}
            </button>
          )}

          {/*
            A missing button with no explanation is the complaint this project
            has already had once. Say why it is not there.
          */}
          {order.status === 'shipped' && !order.canDeclareDelivered && (
            <p className="mt-4 text-sm text-gray-500">
              The courier confirms this delivery, so there is nothing to press. It
              updates on its own from their tracking — usually within a day of the
              parcel arriving.
            </p>
          )}

          {order.deliveryConfirmedBy === 'seller' && (
            <p className="mt-4 text-sm text-gray-500">
              You marked this delivered yourself. The customer has three days to
              confirm or object before the payment is released.
            </p>
          )}
        </div>

        {/* Back Button */}
        <button
          onClick={() => navigate('/seller/orders')}
          className="w-full py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back to Orders
        </button>
      </div>

      <ReasonModal
        open={refusing}
        title="Refuse this return?"
        hint="The customer is shown this, and can dispute it."
        label="Why are you refusing it?"
        placeholder="The box came back empty"
        note="No money moves and the sale stands. Refusing without a real reason is what a pattern of refusals looks like later."
        confirmLabel="Refuse the return"
        confirmVariant="destructive"
        busy={updating}
        onSubmit={async (reason) => {
          setUpdating(true);
          try {
            const { data } = await settleReturn(order._id, 'reject', reason);
            toastSuccess(data.message || 'Return refused');
            setRefusing(false);
            await loadOrder();
          } catch (err) {
            toastError(err?.response?.data?.message || 'That did not work');
          } finally {
            setUpdating(false);
          }
        }}
        onClose={() => setRefusing(false)}
      />
    </Layout>
  );
}
