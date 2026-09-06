import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import {
  getSellerOrders,
  updateOrderStatus,
  updateTracking,
  shipOrder,
  cancelShipment,
  cancelOwnLines,
} from '../../services/sellerService';
import { toastSuccess, toastError } from '../../utils/toast';
import { Link } from 'react-router-dom';

import { orderRef } from '../../utils/orderRef';
import { useConfirm } from '../../context/confirmContext';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { money } from '../../utils/money';
/**
 * The stages this seller's parcel moves through.
 *
 * 'pending' used to be missing, so indexOf() returned -1 for it and every dot
 * rendered grey - on the one status most orders are actually sitting in. The
 * progress row said nothing at exactly the moment the seller needed to act.
 */
const statusFlow = ['pending', 'processing', 'shipped', 'delivered'];

export default function SellerOrdersPage() {
  const confirm = useConfirm();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  /**
   * Saying "I cannot supply this".
   *
   * The reason is required rather than optional: the customer is told it, and
   * a seller who is repeatedly out of stock is exactly the pattern a
   * marketplace has to be able to see afterwards.
   */
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const submitOwnCancel = async () => {
    if (cancelReason.trim().length < 3) {
      toastError('Please say why - the customer is told, and it stays on the order');
      return;
    }
    setCancelBusy(true);
    try {
      const { data } = await cancelOwnLines(cancellingOrder._id, cancelReason.trim());
      toastSuccess(data.message || 'Cancelled and refunded');
      setCancellingOrder(null);
      setCancelReason('');
      await loadOrders();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not cancel that order');
    } finally {
      setCancelBusy(false);
    }
  };
  const [trackingData, setTrackingData] = useState({}); // Per-order tracking state

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await getSellerOrders();
      setOrders(res.data.orders);
    } catch (err) {
      console.error('Failed to load seller orders', err);
      toastError('Could not load your orders');
      toastError(err?.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleTrackingUpdate = async (orderId) => {
    const data = trackingData[orderId];
    if (!data?.courierName?.trim() || !data?.trackingNumber?.trim()) {
      toastError('Please enter both courier name and tracking number');
      return;
    }

    try {
      await updateTracking(orderId, {
        courierName: data.courierName,
        trackingNumber: data.trackingNumber,
      });
      toastSuccess('Tracking updated');
      // Clear tracking inputs for this order
      setTrackingData((prev) => ({
        ...prev,
        [orderId]: { courierName: '', trackingNumber: '' },
      }));
      loadOrders();
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed to update tracking');
    }
  };

  /**
   * Books a real courier for a packed parcel.
   *
   * Deliberately a button the seller presses rather than something that happens
   * at checkout: until this moment no courier knows the order exists, so a
   * mistaken order can be cancelled with nothing to undo. The confirmation says
   * plainly what pressing it costs.
   */
  const handleShip = async (order) => {
    const sameDay = order.deliveryOption === 'same_day';

    const sure = await confirm({
      title: sameDay ? 'Book a same-day rider?' : 'Book the courier?',
      message: sameDay
        ? 'A rider will be sent to collect this parcel today. This costs money and can only be cancelled before they arrive.'
        : 'This books a real shipment, charges your courier wallet, and schedules a pickup. It can be cancelled until the parcel is collected.',
      confirmLabel: sameDay ? 'Book rider' : 'Book courier',
      danger: false,
    });
    if (!sure) return;

    try {
      setUpdatingId(order._id);
      const { data } = await shipOrder(order._id);
      toastSuccess(data.message || 'Courier booked');
      loadOrders();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not book the courier');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancelShipment = async (order) => {
    const sure = await confirm({
      title: 'Cancel this shipment?',
      message: 'The courier is called off and the order goes back to processing.',
      confirmLabel: 'Cancel shipment',
    });
    if (!sure) return;

    try {
      setUpdatingId(order._id);
      const { data } = await cancelShipment(order._id);
      toastSuccess(data.message || 'Shipment cancelled');
      loadOrders();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not cancel the shipment');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusUpdate = async (orderId, nextStatus) => {
    const sure = await confirm({
      title: `Mark this order as ${nextStatus}?`,
      message: 'The customer is notified, and this cannot be undone.',
      confirmLabel: `Mark ${nextStatus}`,
      danger: false,
    });
    if (!sure) return;

    try {
      setUpdatingId(orderId);
      await updateOrderStatus(orderId, nextStatus);
      toastSuccess('Order status updated');
      loadOrders();
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const updateTrackingField = (orderId, field, value) => {
    setTrackingData((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        [field]: value,
      },
    }));
  };

  const getNextStatus = (current) => {
    if (['cancelled', 'returned'].includes(current)) return null;
    if (current === 'pending') return 'processing';
    if (current === 'processing') return 'shipped';
    if (current === 'shipped') return 'delivered';
    return null;
  };

  // ✅ Calculate seller-specific revenue
  const renderTimeline = (status) => {
    if (['cancelled', 'returned'].includes(status)) return null;

    const reached = statusFlow.indexOf(status);

    return (
      // Named steps, because four unlabelled dots communicate nothing even when
      // they are coloured correctly. Orange marks where the seller is now -
      // the step that still wants something from them.
      <ol className="flex items-center gap-1 mt-3" aria-label="Order progress">
        {statusFlow.map((step, idx) => {
          const done = idx < reached;
          const current = idx === reached;

          return (
            <li key={step} className="flex items-center gap-1">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    done
                      ? 'bg-positive'
                      : current
                      ? 'bg-brand-fill ring-4 ring-brand-200'
                      : 'bg-gray-300'
                  }`}
                />
                <span
                  className={`text-xs capitalize ${
                    current
                      ? 'text-brand-ink font-medium'
                      : done
                      ? 'text-gray-600'
                      : 'text-gray-400'
                  }`}
                >
                  {step}
                </span>
              </div>
              {idx !== statusFlow.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`w-5 h-0.5 mx-1 ${done ? 'bg-positive' : 'bg-gray-200'}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    );
  };

  if (loading) {
    return (
      <Layout title="Seller Orders">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded-lg w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded-lg"></div>
          <div className="h-32 bg-gray-200 rounded-lg"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Seller Orders">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">My Orders</h2>

        {orders.length === 0 ? (
          <p className="text-sm text-gray-600">No orders received yet.</p>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => {
              const nextStatus = getNextStatus(order.status);
              return (
                <div key={order._id} className="bg-white p-5 rounded-lg shadow border space-y-4">
                  {/* ✅ HEADER */}
                  <div className="flex flex-col md:flex-row md:justify-between gap-3 pb-3 border-b">
                    <div>
                      <span className="font-semibold text-sm">
                        Order {orderRef(order)}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status={order.status} />
                      <Badge status={order.paymentStatus} />
                    </div>
                  </div>

                  {/* ✅ CUSTOMER INFO */}
                  <div className="text-xs text-gray-700">
                    <p>
                      <span className="font-medium">Customer:</span>{' '}
                      {order.customerId?.name || 'N/A'}
                    </p>
                    <p className="text-gray-500">{order.customerId?.email || 'N/A'}</p>
                  </div>

                  {/* ✅ ITEMS */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600">Items in this order:</p>
                    {order.items.map((item) => (
                      <div
                        key={item._id}
                        className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-gray-600">
                            Qty: {item.quantity} × ₹{item.price}
                          </p>
                          {item.status === 'cancelled' && (
                            <span className="text-red-600 font-semibold">(Cancelled)</span>
                          )}
                        </div>
                        <p className="font-bold">₹{item.price * item.quantity}</p>
                      </div>
                    ))}
                  </div>

                  {/*
                    WHAT THE SELLER ACTUALLY GETS

                    This said "Your Revenue" and showed the GROSS - what the
                    customer paid. A seller on the default 8% saw ₹1000 here and
                    ₹920 in their payout, with nothing on screen explaining the
                    gap. The commission is now a line of its own, and the number
                    in bold is the one that reaches them.

                    All three come from the server, computed from the commission
                    SNAPSHOT taken when the order was placed - so an old order
                    keeps showing the rate it was actually sold under.
                  */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between text-gray-700">
                      <span>Item total</span>
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
                        <span className="tabular-nums">
                          −{money(order.sellerCommission)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between pt-1 border-t border-blue-200">
                      <span className="font-medium text-gray-800">You earn</span>
                      <span className="font-bold text-blue-700 tabular-nums">
                        {money(order.sellerEarning)}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs text-gray-600 pt-1">
                      <span>Payment</span>
                      <span className="font-medium">
                        {order.paymentMethod === 'cod'
                          ? 'Cash on delivery'
                          : 'Paid online'}
                      </span>
                    </div>

                    {/*
                      This tested for 'completed', which is not one of the four
                      values paymentStatus can hold, so it never once appeared.
                      COD is money the seller collects at the door, so "paid"
                      there means collected, not received in advance.
                    */}
                    {order.paymentStatus === 'paid' && (
                      <p className="text-xs text-positive font-semibold">
                        ✓ {order.paymentMethod === 'cod' ? 'Cash collected' : 'Payment received'}
                      </p>
                    )}
                    {order.paymentStatus === 'refunded' && (
                      <p className="text-xs text-red-700 font-semibold">Refunded</p>
                    )}
                  </div>

                  {/* ✅ TRACKING INFO */}
                  {order.trackingInfo?.courierName && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs">
                      <p className="font-semibold mb-1">Tracking Information:</p>
                      <p>
                        <strong>Courier:</strong> {order.trackingInfo.courierName}
                      </p>
                      <p>
                        <strong>Tracking:</strong> {order.trackingInfo.trackingNumber}
                      </p>
                      {order.trackingInfo.shippedDate && (
                        <p className="text-gray-600">
                          Shipped: {new Date(order.trackingInfo.shippedDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/*
                    ACTIONS

                    One primary per card, and it is whatever moves this order
                    forward: booking the courier while nothing is booked, and
                    after that marking the next status. Everything else is
                    secondary. These were three different colours before - blue,
                    green and orange - which told the seller nothing about which
                    to press.
                  */}
                  {(() => {
                    const canBook =
                      !order.shippingAwb &&
                      !['cancelled', 'delivered', 'returned'].includes(order.status);

                    return (
                      <div className="flex flex-col md:flex-row gap-3">
                        {canBook && (
                          <Button
                            variant="primary"
                            fullWidth
                            onClick={() => handleShip(order)}
                            loading={updatingId === order._id}
                            loadingText="Booking…"
                            className="md:flex-1"
                          >
                            {order.deliveryOption === 'same_day'
                              ? 'Book same-day rider'
                              : 'Book courier & ship'}
                          </Button>
                        )}

                        {nextStatus && (
                          <Button
                            // Primary only when there is nothing more urgent.
                            variant={canBook ? 'secondary' : 'primary'}
                            fullWidth
                            onClick={() => handleStatusUpdate(order._id, nextStatus)}
                            loading={updatingId === order._id}
                            loadingText="Updating…"
                            className="md:flex-1"
                          >
                            Mark as {nextStatus}
                          </Button>
                        )}

                        <Button
                          as={Link}
                          to={`/seller/orders/${order._id}`}
                          variant="secondary"
                          fullWidth
                          className="md:flex-1"
                        >
                          View full details
                        </Button>

                        {order.shippingAwb && order.status === 'shipped' && (
                          <Button
                            variant="destructive"
                            fullWidth
                            onClick={() => handleCancelShipment(order)}
                            disabled={updatingId === order._id}
                            className="md:flex-1"
                          >
                            Cancel shipment
                          </Button>
                        )}

                        {/*
                          Calling off the ORDER, which is a different thing from
                          calling off the courier. A seller who cannot supply had
                          only the courier button, which leaves the order live and
                          the customer waiting for something that is never coming.
                          Only offered before anything is booked - a parcel with a
                          courier has to be recalled first.
                        */}
                        {['pending', 'processing'].includes(order.status) &&
                          !order.shippingAwb && (
                            <Button
                              variant="destructive"
                              fullWidth
                              onClick={() => setCancellingOrder(order)}
                              disabled={updatingId === order._id}
                              className="md:flex-1"
                            >
                              Cannot supply
                            </Button>
                          )}
                      </div>
                    );
                  })()}

                  {/* ✅ ADD TRACKING (if not added) */}
                  {['processing', 'shipped'].includes(order.status) &&
                    !order.trackingInfo?.courierName && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-xs font-semibold mb-2">Add Tracking Info:</p>
                        <div className="flex flex-col md:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Courier Name"
                            value={trackingData[order._id]?.courierName || ''}
                            onChange={(e) =>
                              updateTrackingField(order._id, 'courierName', e.target.value)
                            }
                            className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Tracking Number"
                            value={trackingData[order._id]?.trackingNumber || ''}
                            onChange={(e) =>
                              updateTrackingField(order._id, 'trackingNumber', e.target.value)
                            }
                            className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          />
                          <Button
                            variant="secondary"
                            onClick={() => handleTrackingUpdate(order._id)}
                          >
                            Save tracking
                          </Button>
                        </div>
                      </div>
                    )}

                  {/* Timeline */}
                  {renderTimeline(order.status)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Modal
        open={Boolean(cancellingOrder)}
        title={`Cannot supply ${orderRef(cancellingOrder) || 'this order'}?`}
        hint="Your items are cancelled and the customer is refunded for them."
        onClose={() => setCancellingOrder(null)}
      >
        <p className="text-sm text-gray-600">
          Only your own items go. If another seller is in this order, theirs
          carry on.
        </p>

        <label htmlFor="why" className="block text-sm mt-4 mb-1">
          Why can you not supply it?
        </label>
        <textarea
          id="why"
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Out of stock - last piece was damaged"
          className="w-full border rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <p className="text-xs text-gray-500 mt-1">
          The customer is told this, and it stays on the order.
        </p>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setCancellingOrder(null)}>
            Keep the order
          </Button>
          <Button
            variant="destructive"
            onClick={submitOwnCancel}
            loading={cancelBusy}
            loadingText="Cancelling…"
          >
            Cancel and refund
          </Button>
        </div>
      </Modal>

    </Layout>
  );
}
