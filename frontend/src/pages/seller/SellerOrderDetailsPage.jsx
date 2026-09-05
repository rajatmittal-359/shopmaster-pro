import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import { getOrderDetails, updateOrderStatus, updateTracking } from '../../services/sellerService';
import { toastSuccess, toastError } from '../../utils/toast';

import { orderRef } from '../../utils/orderRef';
import { useConfirm } from '../../context/confirmContext';
import { money } from '../../utils/money';
const statusFlow = ['processing', 'shipped', 'delivered'];

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-positive',
  cancelled: 'bg-red-100 text-red-700',
  returned: 'bg-gray-100 text-gray-700',
};

const paymentColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-positive',
  completed: 'bg-green-100 text-positive',
};

export default function SellerOrderDetailsPage() {
  const confirm = useConfirm();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

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

  const nextStatus = getNextStatus(order.status);
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

        {/* Items */}
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="font-semibold text-lg mb-3">Order Items</h3>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div
                key={item._id}
                className={`flex justify-between items-center pb-3 border-b last:border-b-0 ${
                  item.status === 'cancelled' ? 'opacity-50' : ''
                }`}
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-600">
                    ₹{item.price} × {item.quantity}
                  </p>
                  {item.status === 'cancelled' && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg">
                      Cancelled
                    </span>
                  )}
                </div>
                <p className="font-bold">₹{item.price * item.quantity}</p>
              </div>
            ))}
          </div>

          {/*
            The same breakdown as the orders list, and for the same reason: the
            bold number has to be what the seller is actually paid, not what the
            customer paid. See sellerMoneyFor in sellerController.
          */}
          <div className="mt-4 pt-4 border-t bg-blue-50 p-3 rounded-lg space-y-1 text-sm">
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
                <span className="tabular-nums">−{money(order.sellerCommission)}</span>
              </div>
            )}

            <div className="flex justify-between pt-1 border-t border-blue-200 text-lg font-bold">
              <span>You earn</span>
              <span className="text-blue-700 tabular-nums">
                {money(order.sellerEarning)}
              </span>
            </div>

            <p className="text-xs text-gray-600 pt-1">
              Payment:{' '}
              {order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}
            </p>
            {order.paymentStatus === 'paid' && (
              <p className="text-xs text-positive font-semibold">
                ✓ {order.paymentMethod === 'cod' ? 'Cash collected' : 'Payment received'}
              </p>
            )}
            {order.paymentStatus === 'refunded' && (
              <p className="text-xs text-red-700 font-semibold">Refunded</p>
            )}
          </div>
        </div>

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
              className="mt-4 w-full py-3 bg-brand-700 hover:bg-brand-700 text-white rounded-lg font-semibold disabled:opacity-50"
            >
              {updating ? 'Updating...' : `Mark as ${nextStatus}`}
            </button>
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
    </Layout>
  );
}
