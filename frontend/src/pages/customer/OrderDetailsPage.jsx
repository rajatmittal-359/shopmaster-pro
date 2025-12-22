import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import { getOrderDetails, cancelOrder, cancelOrderItem } from '../../services/orderService';
import { toastSuccess, toastError } from '../../utils/toast';

// Status color mapping
const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  returned: 'bg-gray-100 text-gray-700',
};

const paymentStatusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
};

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancellingItemId, setCancellingItemId] = useState(null);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const res = await getOrderDetails(orderId);
      setOrder(res.data.order);
    } catch (err) {
      console.error(err);
      toastError(err?.response?.data?.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const handleCancelOrder = async () => {
    if (!window.confirm('Are you sure you want to cancel this entire order?')) {
      return;
    }
    try {
      setCancelling(true);
      await cancelOrder(orderId);
      toastSuccess('Order cancelled successfully');
      await loadOrder();
    } catch (err) {
      console.error(err);
      toastError(err?.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  // ✅ NEW: Cancel individual item
  const handleCancelItem = async (itemId, itemName) => {
    if (!window.confirm(`Cancel "${itemName}" from this order?`)) {
      return;
    }
    try {
      setCancellingItemId(itemId);
      await cancelOrderItem(orderId, itemId);
      toastSuccess('Item cancelled successfully');
      await loadOrder();
    } catch (err) {
      console.error(err);
      toastError(err?.response?.data?.message || 'Failed to cancel item');
    } finally {
      setCancellingItemId(null);
    }
  };

  if (loading) {
    return (
      <Layout title="Order Details">
        <div className="animate-pulse space-y-4 max-w-4xl mx-auto p-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout title="Order Not Found">
        <div className="max-w-4xl mx-auto p-4 text-center">
          <p className="text-gray-600 mb-4">Order not found</p>
          <Link to="/customer/orders" className="text-blue-600 hover:underline">
            Back to Orders
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Order Details">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Order Details</h2>
            <p className="text-sm text-gray-600">
              Order ID: #{order._id.slice(-6)}
            </p>
            <p className="text-xs text-gray-500">
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded text-sm font-medium capitalize ${
                statusColors[order.status] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {order.status}
            </span>
            <span
              className={`px-3 py-1 rounded text-sm font-medium capitalize ${
                paymentStatusColors[order.paymentStatus] || 'bg-gray-100 text-gray-700'
              }`}
            >
              Payment: {order.paymentStatus}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded shadow p-5">
          <h3 className="font-semibold text-lg mb-4">Items</h3>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div
                key={item._id}
                className={`flex flex-col sm:flex-row sm:justify-between gap-3 pb-4 border-b last:border-b-0 ${
                  item.status === 'cancelled' ? 'opacity-50' : ''
                }`}
              >
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-600">
                    ₹{item.price} × {item.quantity}
                  </p>
                  {item.status === 'cancelled' && (
                    <span className="inline-block mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                      Cancelled
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold">₹{item.price * item.quantity}</p>
                  
                  {/* ✅ NEW: Cancel Item Button */}
                  {order.status !== 'delivered' &&
                    order.status !== 'cancelled' &&
                    order.status !== 'returned' &&
                    item.status !== 'cancelled' && (
                      <button
                        onClick={() => handleCancelItem(item._id, item.name)}
                        disabled={cancellingItemId === item._id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        {cancellingItemId === item._id ? 'Cancelling...' : 'Cancel Item'}
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>

          {/* Order Total */}
          <div className="mt-4 pt-4 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Items Total</span>
              <span className="font-medium">
                ₹{order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)}
              </span>
            </div>
            {order.shippingCharges > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping Charges</span>
                <span className="font-medium text-green-600">₹{order.shippingCharges}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Grand Total</span>
              <span className="text-orange-600">₹{order.totalAmount}</span>
            </div>
          </div>
        </div>

        {/* Shipping Address - ✅ FIXED */}
        <div className="bg-white rounded shadow p-5">
          <h3 className="font-semibold text-lg mb-3">Shipping Address</h3>
          {order.shippingAddressId ? (
            <div className="text-sm text-gray-700 space-y-1">
              <p className="font-medium">{order.shippingAddressId.label || 'Home'}</p>
              <p>{order.shippingAddressId.street}</p>
              <p>
                {order.shippingAddressId.city}, {order.shippingAddressId.state} - {order.shippingAddressId.zipCode}
              </p>
              <p>{order.shippingAddressId.country || 'India'}</p>
              <p className="text-gray-600">Phone: {order.shippingAddressId.phoneNumber}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Address not available</p>
          )}
        </div>

        {/* Tracking Info */}
        {order.trackingInfo && (
          <div className="bg-white rounded shadow p-5">
            <h3 className="font-semibold text-lg mb-3">Tracking Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Courier</span>
                <span className="font-medium">{order.trackingInfo.courierName || 'N/A'}</span>
              </div>
              {order.trackingInfo.trackingNumber && (
                <div className="flex flex-col gap-2">
                  <span className="text-gray-600">Tracking Number</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={order.trackingInfo.trackingNumber}
                      readOnly
                      className="flex-1 px-3 py-2 bg-gray-50 border rounded text-sm"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(order.trackingInfo.trackingNumber);
                        toastSuccess('Tracking number copied!');
                      }}
                      className="px-4 py-2 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
              {order.trackingInfo.shippedDate && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipped Date</span>
                  <span className="font-medium">
                    {new Date(order.trackingInfo.shippedDate).toLocaleDateString()}
                  </span>
                </div>
              )}
              {order.trackingInfo.courierName?.toLowerCase().includes('shiprocket') && (
                <a
                  href="https://www.shiprocket.in/shipment-tracking"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                >
                  Track on Shiprocket →
                </a>
              )}
            </div>
          </div>
        )}

        {/* Payment Info */}
        <div className="bg-white rounded shadow p-5">
          <h3 className="font-semibold text-lg mb-3">Payment Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Payment Method</span>
              <span className="font-medium capitalize">
                {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Payment Status</span>
              <span
                className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                  paymentStatusColors[order.paymentStatus] || 'bg-gray-100 text-gray-700'
                }`}
              >
                {order.paymentStatus}
              </span>
            </div>
            {order.razorpayPaymentId && (
              <div className="flex justify-between">
                <span className="text-gray-600">Payment ID</span>
                <span className="font-mono text-xs">{order.razorpayPaymentId}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/customer/orders"
            className="flex-1 text-center px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            Back to Orders
          </Link>
          
          {/* Cancel Order Button */}
          {order.status !== 'delivered' &&
            order.status !== 'cancelled' &&
            order.status !== 'returned' && (
              <button
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Entire Order'}
              </button>
            )}
        </div>
      </div>
    </Layout>
  );
}
