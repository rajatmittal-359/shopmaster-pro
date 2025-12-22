// frontend/src/pages/customer/OrderDetailsPage.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import { getOrderDetails, cancelOrder, returnOrder, cancelOrderItem } from '../../services/orderService';
import { toastSuccess, toastError } from '../../utils/toast';

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancellingItemId, setCancellingItemId] = useState(null); // ✅ NEW

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

  const handleCancel = async () => {
    if (!window.confirm('Cancel this entire order?')) return;
    try {
      setActionLoading(true);
      await cancelOrder(orderId);
      toastSuccess('Order cancelled successfully');
      navigate('/customer/orders');
    } catch (err) {
      toastError(err?.response?.data?.message || 'Cancel failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!window.confirm('Return this order?')) return;
    try {
      setActionLoading(true);
      await returnOrder(orderId);
      toastSuccess('Order returned successfully');
      navigate('/customer/orders');
    } catch (err) {
      toastError(err?.response?.data?.message || 'Return failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ✅ NEW: Cancel individual item
  const handleCancelItem = async (itemId, itemName) => {
    if (!window.confirm(`Cancel "${itemName}" from this order?`)) return;
    try {
      setCancellingItemId(itemId);
      await cancelOrderItem(orderId, itemId);
      toastSuccess('Item cancelled successfully');
      await loadOrder(); // Reload order to show updated data
    } catch (err) {
      toastError(err?.response?.data?.message || 'Failed to cancel item');
    } finally {
      setCancellingItemId(null);
    }
  };

  if (loading) return <Layout title="Order Details"><p className="p-6">Loading...</p></Layout>;
  if (!order) return <Layout title="Order Details"><p className="p-6">Order not found</p></Layout>;

  const addr = order.shippingAddressId; // ✅ Works if backend populates it

  return (
    <Layout title="Order Details">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* ORDER HEADER */}
        <div className="bg-white p-4 rounded shadow">
          <p className="text-sm font-semibold">Order ID: #{order._id.slice(-8)}</p>
          <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleString()}</p>
          <p className="text-sm mt-2">
            Status: <strong className="capitalize">{order.status}</strong>
          </p>
          <p className="text-sm">
            Payment: <strong className="uppercase">{order.paymentStatus}</strong>
          </p>
        </div>

        {/* ITEMS */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-3">Items</h2>
          <div className="space-y-3">
            {order.items.map(item => (
              <div
                key={item._id}
                className={`flex justify-between items-start border-b pb-3 ${
                  item.status === 'cancelled' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  {item.productId?.images?.[0] && (
                    <img
                      src={item.productId.images[0]}
                      alt={item.name}
                      className="w-16 h-16 object-cover border rounded"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">₹{item.price} × {item.quantity}</p>
                    {item.status === 'cancelled' && (
                      <span className="inline-block mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-sm font-semibold">₹{item.price * item.quantity}</p>
                  
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
          <div className="mt-4 pt-4 border-t space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>₹{order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)}</span>
            </div>
            {order.shippingCharges > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="text-green-600">₹{order.shippingCharges}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Grand Total</span>
              <span className="text-orange-600">₹{order.totalAmount}</span>
            </div>
          </div>
        </div>

        {/* SHIPPING ADDRESS - ✅ FIXED */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Shipping Address</h2>
          {addr ? (
            <div className="text-sm text-gray-700 space-y-1">
              <p className="font-medium">{addr.label || 'Home'}</p>
              <p>{addr.street}</p>
              <p>{addr.city}, {addr.state} - {addr.zipCode}</p>
              <p>{addr.country || 'India'}</p>
              <p className="text-gray-600">Phone: {addr.phoneNumber}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Shipping address not available.</p>
          )}
        </div>

        {/* TRACKING INFO - ✅ IMPROVED */}
        {order.trackingInfo && order.trackingInfo.courierName && (
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <h2 className="font-semibold mb-3 text-sm">Track Your Shipment</h2>
            <div className="space-y-2 text-sm">
              <p><strong>Courier:</strong> {order.trackingInfo.courierName}</p>
              {order.trackingInfo.trackingNumber && (
                <div className="flex flex-col gap-2">
                  <strong>Tracking Number:</strong>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={order.trackingInfo.trackingNumber}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border rounded text-sm font-mono"
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
                <p>
                  <strong>Shipped:</strong> {new Date(order.trackingInfo.shippedDate).toLocaleDateString()}
                </p>
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

        {/* ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate('/customer/orders')}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            Back to Orders
          </button>

          {['pending', 'processing'].includes(order.status) && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              {actionLoading ? 'Cancelling...' : 'Cancel Entire Order'}
            </button>
          )}

          {order.status === 'delivered' && (
            <button
              onClick={handleReturn}
              disabled={actionLoading}
              className="flex-1 px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
            >
              {actionLoading ? 'Returning...' : 'Return Order'}
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
